# Race Pace Tracker

Un outil pour suivre vos entraînements de course en temps réel, avec comparaison des temps intermédiaires par rapport à des temps de référence (fichier GPX).

## Fonctionnalités
- Chargement d'un parcours GPX avec waypoints et temps de référence.
- Suivi GPS en temps réel (toutes les 3 secondes).
- Affichage des écarts par rapport aux temps de référence.
- Carte interactive avec position et waypoints.

## Comment l'utiliser ?
1. Téléchargez le fichier `entrainement.html`.
2. Servez-le via un serveur local (ex: `python -m http.server 8000`).
3. Ouvrez la page dans Chrome sur votre téléphone.
4. Chargez un fichier GPX avec vos waypoints et temps de référence.
5. Démarrez l'entraînement et courez !

## Exemple de fichier GPX
```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
    <wpt lat="46.519653" lon="6.632273">
        <name>Départ</name>
        <extensions>
            <timeOffset>0</timeOffset> <!-- Temps en secondes -->
        </extensions>
    </wpt>
    <wpt lat="46.520123" lon="6.633456">
        <name>Waypoint 1</name>
        <extensions>
            <timeOffset>330</timeOffset> <!-- 5 min 30 s -->
        </extensions>
    </wpt>
</gpx>
