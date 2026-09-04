/**
 * Race Pace Tracker - Logique principale
 * Fichier : app.js
 */

// --- Variables Globales ---
let watchId;
let allWaypoints = [];
let measuredWaypoints = [];
let currentWaypointIndex = 0;
let startTime = null;
let map, userMarker, trackLine, waypointMarkers = [];
let detectionCircle = null;
let waypointHistory = [];
let isRaceStarted = false;
let isTrainingStarted = false;
let currentDetectionRadius = 0;

// --- Fonctions Utilitaires (Exportables pour tests) ---

/**
 * Calcule la distance entre deux points GPS (Formule de Haversine)
 * @returns distance en mètres
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Rayon terre en mètres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/**
 * Formate des secondes en chaîne hh:mm:ss
 */
function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse le contenu texte d'un fichier GPX
 * @returns { allWaypoints: [], measuredWaypoints: [] }
 */
function parseGPX(gpxData) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxData, "text/xml");
    const trkpts = xmlDoc.getElementsByTagName("trkpt");
    const allWpts = [];
    const measuredWpts = [];

    for (let i = 0; i < trkpts.length; i++) {
        const trkpt = trkpts[i];
        const lat = parseFloat(trkpt.getAttribute("lat"));
        const lon = parseFloat(trkpt.getAttribute("lon"));
        const nameElement = trkpt.getElementsByTagName("name")[0];
        const name = nameElement?.textContent || `Point ${i+1}`;

        if (isNaN(lat) || isNaN(lon)) continue;

        allWpts.push({ lat, lon, name });

        if (nameElement) {
            const timeOffset = parseFloat(nameElement.textContent);
            if (!isNaN(timeOffset)) {
                measuredWpts.push({ lat, lon, name, timeOffset });
            }
        }
    }
    return { allWaypoints: allWpts, measuredWaypoints: measuredWpts };
}

// --- Fonctions d'Initialisation et Carte ---

function initMap() {
    map = L.map('map').setView([46.5, 6.6], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);
}

function updateDetectionCircle(radius) {
    if (!map) return;
    if (detectionCircle) {
        map.removeLayer(detectionCircle);
        detectionCircle = null;
    }

    if (currentWaypointIndex < measuredWaypoints.length && radius > 0) {
        const waypoint = measuredWaypoints[currentWaypointIndex];
        detectionCircle = L.circle([waypoint.lat, waypoint.lon], {
            color: 'red',
            fillColor: '#f03',
            fillOpacity: 0.2,
            radius: radius
        }).addTo(map);
    }
}

function plotTrackOnMap() {
    if (!map) return;
    if (trackLine) map.removeLayer(trackLine);
    waypointMarkers.forEach(marker => map.removeLayer(marker));
    waypointMarkers = [];

    const trackCoordinates = allWaypoints.map(wpt => [wpt.lat, wpt.lon]);

    if (trackCoordinates.length > 1) {
        trackLine = L.polyline(trackCoordinates, { color: 'blue', weight: 3, opacity: 0.7 }).addTo(map);
        map.fitBounds(trackLine.getBounds());
    } else if (trackCoordinates.length === 1) {
        map.setView(trackCoordinates[0], 15);
    }

    measuredWaypoints.forEach((wpt, index) => {
        let markerText, markerColor;
        if (index === 0) { markerText = "D"; markerColor = "green"; }
        else if (index === measuredWaypoints.length - 1) { markerText = "A"; markerColor = "red"; }
        else {
            markerText = index;
            markerColor = index === currentWaypointIndex ? 'red' : (index < currentWaypointIndex ? 'gray' : 'blue');
        }

        const marker = L.marker([wpt.lat, wpt.lon], {
            title: wpt.name,
            icon: L.divIcon({
                className: 'waypoint-marker',
                html: `<div style="background-color: ${markerColor}; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold;">${markerText}</div>`
            })
        }).addTo(map);
        waypointMarkers.push(marker);
    });
}

// --- Gestion de l'Interface Utilisateur ---

function displayWaypointInfo() {
    const infoDiv = document.getElementById('waypointInfo');
    if (!infoDiv) return;

    if (currentWaypointIndex >= measuredWaypoints.length) {
        infoDiv.textContent = "Tous les waypoints ont été atteints !";
        return;
    }
    const waypoint = measuredWaypoints[currentWaypointIndex];
    const radiusText = currentDetectionRadius > 0 
        ? `${currentDetectionRadius.toFixed(1)} m (2x précision GPS)` 
        : "En attente du signal GPS...";

    infoDiv.innerHTML = `
        <strong>Waypoint actuel :</strong> ${waypoint.name}<br>
        <strong>Position :</strong> ${waypoint.lat.toFixed(6)}, ${waypoint.lon.toFixed(6)}<br>
        <strong>Temps de référence :</strong> ${formatTime(waypoint.timeOffset)}<br>
        <strong>Rayon de détection :</strong> ${radiusText}
    `;
    
    if (currentDetectionRadius > 0) {
        updateDetectionCircle(currentDetectionRadius);
    }
}

function updateHistoryDisplay() {
    const historyElement = document.getElementById('history');
    if (!historyElement) return;

    if (waypointHistory.length === 0) {
        historyElement.innerHTML = `<h3>Historique des waypoints</h3><p>Aucun waypoint atteint pour l'instant.</p>`;
        return;
    }

    let tableRows = waypointHistory.map((entry, index) => {
        const displayIndex = waypointHistory.length - index;
        const diffClass = entry.timeDiff >= 0 ? 'behind' : 'ahead';
        const diffText = entry.timeDiff >= 0 ? `+${entry.timeDiff.toFixed(1)}s` : `${Math.abs(entry.timeDiff).toFixed(1)}s`;
        return `
            <tr>
                <td>${displayIndex}</td>
                <td>${entry.name}</td>
                <td>${formatTime(entry.elapsedTime)}</td>
                <td>${formatTime(entry.timeOffset)}</td>
                <td class="time-diff ${diffClass}">${diffText}</td>
            </tr>
        `;
    }).join('');

    historyElement.innerHTML = `
        <h3>Historique des waypoints</h3>
        <table>
            <thead><tr><th>#</th><th>Nom</th><th>Temps réel</th><th>Temps référence</th><th>Écart</th></tr></thead>
            <tbody>${tableRows}</tbody>
        </table>
    `;
}

function getWaypointDistanceInfo(userPos) {
    if (currentWaypointIndex >= measuredWaypoints.length) {
        return `<strong>Prochain waypoint :</strong> Aucun<br><strong>Distance restante :</strong> - m`;
    }
    const waypoint = measuredWaypoints[currentWaypointIndex];
    const distance = calculateDistance(userPos.lat, userPos.lon, waypoint.lat, waypoint.lon);
    return `
        <strong>Prochain waypoint :</strong> ${waypoint.name}<br>
        <strong>Distance restante :</strong> ${distance.toFixed(1)} m
    `;
}

function handleGeolocationError(error) {
    let message;
    switch(error.code) {
        case error.PERMISSION_DENIED: message = "Accès GPS refusé."; break;
        case error.POSITION_UNAVAILABLE: message = "Position indisponible."; break;
        case error.TIMEOUT: message = "Délai GPS expiré."; break;
        default: message = "Erreur GPS inconnue.";
    }
    const statusDiv = document.getElementById('status');
    const posDiv = document.getElementById('positionInfo');
    if(statusDiv) statusDiv.textContent = message;
    if(posDiv) posDiv.innerHTML = `<strong>Position actuelle :</strong> Indisponible<br><strong>Erreur :</strong> ${message}`;
}

// --- Gestion des Événements et Boucle Principale ---

function updatePosition(position) {
    const { latitude, longitude, accuracy } = position.coords;
    const userPos = { lat: latitude, lon: longitude };

    // Calcul dynamique du rayon (min 10m, max 200m)
    const dynamicRadius = Math.max(10, Math.min(200, accuracy * 2));
    currentDetectionRadius = dynamicRadius;

    const posDiv = document.getElementById('positionInfo');
    if (posDiv) {
        posDiv.innerHTML = `
            <strong>Position actuelle :</strong> ${latitude.toFixed(6)}, ${longitude.toFixed(6)}<br>
            <strong>Précision GPS :</strong> ±${accuracy.toFixed(1)} m<br>
            <strong>Rayon de détection :</strong> ${dynamicRadius.toFixed(1)} m<br>
            ${getWaypointDistanceInfo(userPos)}
        `;
    }

    if (isTrainingStarted) {
        displayWaypointInfo();
        if (currentWaypointIndex < measuredWaypoints.length) {
            updateDetectionCircle(dynamicRadius);
        }
    }

    if (!userMarker && map) {
        userMarker = L.marker([latitude, longitude], {
            icon: L.divIcon({
                className: 'user-marker',
                html: `<div style="background-color: green; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold;">📍</div>`
            })
        }).addTo(map);
    } else if (userMarker) {
        userMarker.setLatLng([latitude, longitude]);
    }

    if (currentWaypointIndex < measuredWaypoints.length && isTrainingStarted) {
        const waypoint = measuredWaypoints[currentWaypointIndex];
        const distance = calculateDistance(latitude, longitude, waypoint.lat, waypoint.lon);

        if (distance <= dynamicRadius) {
            if (currentWaypointIndex === 0 && !isRaceStarted) {
                startTime = new Date().getTime();
                isRaceStarted = true;
                const statusDiv = document.getElementById('status');
                if(statusDiv) statusDiv.textContent = "Départ détecté ! Chronomètre démarré.";
            } else if (isRaceStarted) {
                const currentTime = new Date().getTime();
                const elapsedTime = (currentTime - startTime) / 1000;
                const timeDiff = (elapsedTime - waypoint.timeOffset).toFixed(1);

                waypointHistory.unshift({
                    name: waypoint.name,
                    elapsedTime: elapsedTime,
                    timeOffset: waypoint.timeOffset,
                    timeDiff: parseFloat(timeDiff)
                });
                updateHistoryDisplay();

                const statusDiv = document.getElementById('status');
                if(statusDiv) {
                    statusDiv.innerHTML = `
                        <strong>Waypoint atteint : ${waypoint.name} !</strong><br>
                        Temps écoulé : ${formatTime(elapsedTime)}<br>
                        Temps de référence : ${formatTime(waypoint.timeOffset)}<br>
                        Différence : <span class="time-diff ${timeDiff >= 0 ? 'behind' : 'ahead'}">${timeDiff >= 0 ? `+${timeDiff}s (retard)` : `${Math.abs(timeDiff)}s (avance)`}</span>
                    `;
                }
                currentWaypointIndex++;
                displayWaypointInfo();
            }
        }
    }
    
    if(map) map.setView([latitude, longitude], 17);
}

// --- Initialisation des Écouteurs d'Événements ---

document.addEventListener('DOMContentLoaded', function() {
    initMap();

    // Import GPX
    const fileInput = document.getElementById('gpxFile');
    if(fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                const gpxData = e.target.result;
                const parsed = parseGPX(gpxData);
                allWaypoints = parsed.allWaypoints;
                measuredWaypoints = parsed.measuredWaypoints;

                const statusDiv = document.getElementById('status');
                if (measuredWaypoints.length > 0) {
                    if(statusDiv) statusDiv.textContent = `Fichier GPX chargé : ${measuredWaypoints.length} waypoints à mesurer.`;
                    document.getElementById('toggleTraining').disabled = false;
                    
                    // Animation simple
                    const importContainer = document.getElementById('gpxImportContainer');
                    if(importContainer) {
                        importContainer.style.opacity = '0.5';
                        importContainer.style.pointerEvents = 'none';
                    }

                    displayWaypointInfo();
                    plotTrackOnMap();
                    waypointHistory = [];
                    updateHistoryDisplay();
                } else {
                    if(statusDiv) statusDiv.textContent = "Aucun waypoint avec timeOffset trouvé.";
                }
            };
            reader.readAsText(file);
        });
    }

    // Bouton Démarrer/Arrêter
    const toggleBtn = document.getElementById('toggleTraining');
    if(toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            if (measuredWaypoints.length === 0) {
                alert("Aucun waypoint chargé !");
                return;
            }

            if (!isTrainingStarted) {
                const statusDiv = document.getElementById('status');
                if(statusDiv) statusDiv.textContent = "En attente du départ...";
                
                this.textContent = "Arrêter l'entraînement";
                this.classList.remove('btn-primary');
                this.classList.add('btn-danger');
                document.getElementById('nextWaypoint').disabled = false;
                
                isTrainingStarted = true;
                startTime = null;
                currentWaypointIndex = 0;
                currentDetectionRadius = 0;
                waypointHistory = [];
                updateHistoryDisplay();
                displayWaypointInfo();

                if (navigator.geolocation) {
                    watchId = navigator.geolocation.watchPosition(
                        updatePosition,
                        handleGeolocationError,
                        { enableHighAccuracy: true, maximumAge: 0, timeout: 3000 }
                    );
                } else {
                    if(statusDiv) statusDiv.textContent = "Géolocalisation non supportée.";
                }
            } else {
                if (watchId) navigator.geolocation.clearWatch(watchId);
                const statusDiv = document.getElementById('status');
                if(statusDiv) statusDiv.textContent = "Entraînement arrêté.";
                
                this.textContent = "Démarrer l'entraînement";
                this.classList.remove('btn-danger');
                this.classList.add('btn-primary');
                document.getElementById('nextWaypoint').disabled = true;
                
                isTrainingStarted = false;
                isRaceStarted = false;
                
                if (detectionCircle) {
                    map.removeLayer(detectionCircle);
                    detectionCircle = null;
                }
            }
        });
    }

    // Bouton Waypoint Suivant
    const nextBtn = document.getElementById('nextWaypoint');
    if(nextBtn) {
        nextBtn.addEventListener('click', function() {
            if (currentWaypointIndex < measuredWaypoints.length - 1) {
                currentWaypointIndex++;
                displayWaypointInfo();
                const statusDiv = document.getElementById('status');
                if(statusDiv) statusDiv.textContent = `Waypoint ${currentWaypointIndex + 1} sélectionné manuellement.`;
            } else {
                const statusDiv = document.getElementById('status');
                if(statusDiv) statusDiv.textContent = "Tous les waypoints atteints !";
                if (detectionCircle) {
                    map.removeLayer(detectionCircle);
                    detectionCircle = null;
                }
            }
        });
    }
});
