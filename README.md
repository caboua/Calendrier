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
   - `GMAIL_USER` avec l'adresse Gmail qui reçoit les mails Airbnb.
   - `GMAIL_APP_PASSWORD` avec un mot de passe d'application Google.
6. Aller dans l'onglet `Actions`, ouvrir `Sync calendars`, puis cliquer sur `Run workflow`.

Le calendrier sera ensuite consultable à l'adresse GitHub Pages du dépôt.

## Synchronisation automatique

Le workflow GitHub Actions s'exécute automatiquement toutes les 30 minutes.

Il met à jour :

- `data/reservations.json` avec les périodes bloquées des calendriers iCal Airbnb et Booking.
- `data/reservations_details.json` avec les détails extraits des mails Airbnb de confirmation : nom, dates, nombre de voyageurs, code, tarif client et somme à recevoir.

Si `GMAIL_USER` ou `GMAIL_APP_PASSWORD` ne sont pas configurés, la synchronisation Gmail est ignorée et seuls les calendriers iCal sont mis à jour.

## Mot de passe Gmail

Pour créer `GMAIL_APP_PASSWORD` :

1. Activer la validation en deux étapes sur le compte Google.
2. Ouvrir les paramètres du compte Google.
3. Créer un mot de passe d'application pour Gmail.
4. Copier ce mot de passe dans le secret GitHub `GMAIL_APP_PASSWORD`.

## Important

Les liens iCal et le mot de passe d'application Gmail restent privés dans les Secrets GitHub. Ils ne doivent jamais être ajoutés directement dans les fichiers du dépôt.
