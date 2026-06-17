# Calendrier partagé Villa CABOUA

Petite application statique pour afficher les réservations Airbnb et Booking sur GitHub Pages.

## Mise en place

1. Créer un dépôt GitHub, par exemple `calendrier-caboua`.
2. Déposer tous les fichiers de ce dossier dans le dépôt.
3. Aller dans `Settings > Pages` et activer GitHub Pages sur la branche `main`, dossier `/root`.
4. Aller dans `Settings > Secrets and variables > Actions > New repository secret`.
5. Ajouter :
   - `AIRBNB_ICAL_URL` avec le lien iCal exporté depuis Airbnb.
   - `BOOKING_ICAL_URL` avec le lien iCal exporté depuis Booking.com.
6. Aller dans l’onglet `Actions`, ouvrir `Synchroniser calendriers`, puis cliquer sur `Run workflow`.

Le calendrier sera ensuite consultable à l’adresse GitHub Pages du dépôt.

## Important

Les liens iCal restent privés dans les Secrets GitHub. Le site public affiche seulement les dates réservées.
