# Sentinelle Doomsday — installation Google Apps Script (désactivée)

Source officielle validée : https://www.pathe.ma/api/show/avengers-doomsday-55389/cinemas
Le moteur ne regarde que la clé cinema-pathe-californie et ses jours programmés (versions et tags). Il ne considère pas la simple présence de « shows » ou « aucune séance » comme une preuve.

## Fichiers à importer dans le projet privé Pathe-Connectivity-Smoke

- tools/google_apps_script_sentinel.gs : détecteur, mémoire, test et transports Gmail / Telegram
- tools/google_apps_script_telegram_setup.gs : identification d'un unique chat Telegram privé
- tests/test_google_apps_script_sentinel.js : régression hors réseau sous Node.js

## Sécurité et configuration

Dans Paramètres du projet > Propriétés du script, renseigner :

| Propriété | Signification |
| --- | --- |
| ALERT_EMAIL_TO | Adresse Gmail destinataire, à garder privée |
| TG_BOT_TOKEN | Jeton du bot créé auprès du compte officiel Telegram @BotFather |
| TG_CHAT_ID | Identifiant numérique de la conversation privée (non le nom @username) |

MailApp envoie les emails depuis le compte Google exécutant le script après autorisation. Aucun mot de passe Gmail ou SMTP n'est nécessaire.
Pour Telegram, créer un bot auprès de @BotFather, envoyer /start au bot depuis le compte destinataire, enregistrer TG_BOT_TOKEN dans les Script Properties puis exécuter sentinelleDiscoverTelegramChat(). Si un seul chat privé est visible, son ID est enregistré automatiquement sans être affiché. Si plusieurs chats existent, renseigner manuellement TG_CHAT_ID.
Ne publier aucun secret, cookie, chat ID, ni adresse Gmail personnelle dans ce dépôt GitHub PUBLIC.

## Étapes de validation avant surveillance

1. Lancer les tests GitHub sur la branche. Aucun réseau Pathé ni notifications.
2. Dans Apps Script, exécuter testSentinelleParserFixture() : sept cas simulés, aucun message réel.
3. Exécuter sentinelleConfigCheck() : drapeaux de configuration uniquement, sans valeurs.
4. Exécuter sentinelleTestNotifications() une seule fois après configuration sécurisée. Vérifier que Gmail et Telegram ont chacun reçu leur message TEST. En cas d'échec d'un seul, ne réessayer que ce canal.
5. Exécuter sentinelleCheckOnce() : sur Doomsday dont la programmation est vide, le moteur doit enregistrer NO_PROGRAMME_FOR_CINEMA sans envoyer d'alerte de réservation.
6. Relancer le même contrôle : aucune fausse notification supplémentaire.
7. Faire confirmer les formats IMAX Laser et horaires détaillés par une séance réellement programmée. La présence de dates, versions et tags ne démontre pas qu'un billet est achetable.

## Garde-fous

- Aucun déclencheur récurrent n'est créé automatiquement par ce code.
- Le moteur n'accède à aucun compte Pathé et n'achète aucune place.
- Erreurs HTTP, JSON ou de schéma : ne jamais transformer en programme vide ou achat possible.
- Alertes de programmation conservatrices avec lien officiel, choix des sièges manuellement.
- Première date ou nouvelle version/tag : alerte PROGRAMMATION, pas BILLETTERIE CONFIRMÉE.
- Les envois Gmail et Telegram sont indépendants et l'état des livraisons est sauvegardé dans les Script Properties.
- Ne planifier un contrôle everyMinutes(5) qu'après preuve des deux notifications et validation explicite, les déclencheurs pouvant être retardés.

## Restent ouverts

Extraction des horaires exacts, cartographie des tags IMAX, liens d'achat, tests de notification réels et autorisation d'activer la surveillance.
Le contrôle ChatGPT récurrent reste désactivé.