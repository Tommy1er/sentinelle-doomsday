# Intégration du signal réel de réservation — PR #3

**Statut : candidat logiciel uniquement.** Cette étape n'est **PAS** déployée dans le projet Google Apps Script et ne crée aucun déclencheur.

## Données réelles observées

Les tests du 16/11/2026 ont identifié `/api/show/{film}/showtimes/{cinema}/{date}`, dont le schéma contient `time`, `status`, `reservabilityStart`, `reservabilityEnd`, `refCmd`, `tags`. La séance témoin `Comment braquer une banque ?` a été vérifiée jusqu'à l'écran de réservation (« 101 places libres »). Cela ne démontre pas encore la disponibilité de places pour Doomsday.

Source : `docs/PATHE_FILM_COHORT_LIVE_RESULT_2026-11-16.md`.

## Nouveau code

- `tools/google_apps_script_booking_monitor.gs` : point d'entrée manuel `sentinelleCheckWithBookingOnce()`. Appelle le détecteur de programmation historique, puis relit les données de séance **à chaque passage**, indépendamment du changement de `days`.
- `tools/google_apps_script_showtime_signal.gs` : classificateur pur construit sur le vrai schéma et 15 tests unitaires. Renvoie `bookingProposedByApi`, non une garantie de stock.
- `tests/test_google_apps_script_booking_monitor.js` : simulation end-to-end d'une date affichée, d'une ouverture horaire sans modification de la programmation, des alertes sur les deux canaux, de l'absence de doublons, d'un HTTP 503, d'un 404 non interprété comme « aucune séance », d'un lien malveillant et d'un nouveau tag IMAX.

Les notifications de réservation sont clairement libellées **« réservation proposée par l'API »**, et non « places garanties ».

## Défense contre les faux négatifs

La surveillance détaillée lit en priorité les dates annoncées par `/cinemas` **et** trois dates de contrôle proches de la sortie (16, 17, 18 décembre), y compris lorsque `/cinemas` renvoie encore `{}`. Cela réduit le risque qu'une prévente apparaisse avant une modification des dates générales.

Les dates de contrôle sont **hypothétiques tant que la réponse de l'API Doomsday avant programmation n'a pas été validée**. Une réponse HTTP 404 est classée « inconnue » et ne devient jamais « aucune séance ». Les erreurs ne suppriment pas la dernière observation saine. Une limite de 14 dates par cycle provoque une erreur de couverture explicite, pas une troncature silencieuse.

## Installation **après** revue

Dans le projet Google Apps Script privé `Pathe-Connectivity-Smoke` doivent coexister les fichiers de code :
- `tools/google_apps_script_sentinel.gs`
- `tools/google_apps_script_showtime_signal.gs`
- `tools/google_apps_script_booking_monitor.gs`

Le point d'entrée à lancer manuellement pour essais est `sentinelleCheckWithBookingOnce()`. Ne pas continuer à planifier `sentinelleCheckOnce()` seul : il ne vérifie que les dates et manquerait un changement de période commerciale sans modification des horaires.

Préserver les Script Properties et la file d'envois existantes. **Ne jamais recopier ni publier les jetons Telegram et autres secrets.**

## Protocole GO / NO-GO

1. Tests automatiques GitHub, notamment `node tests/test_google_apps_script_booking_monitor.js`.
2. Vérifier en Apps Script les appels réels à la route détaillée **de Doomsday**, notamment le comportement pour les trois dates de contrôle avant programmation (200 [] / 404 / autre). Aucun test local ne remplace cette étape.
3. Vérifier la durée moyenne et maximale d'une exécution avec la totalité des dates. Budget moyen indicatif pour 288 exécutions/jour et 90 minutes de quota de déclencheurs : moins de 18,75 secondes par cycle, avec marge pour d'autres scripts.
4. Valider la récupération détaillée du vrai film témoin et la correspondance cinéma / séance / statut / fenêtre / URL.
5. Vérifier le signal IMAX exact sur une véritable séance Pathé Californie. Un tag `imax` n'établit pas la technologie **Laser**.
6. Confirmer la réception effective Telegram sur téléphone (Bot API ok=true avait été constaté) et Gmail. Renouveler le jeton exposé précédemment avant activation définitive.
7. Établir un watchdog externe qui signale l'absence d'une exécution réussie, ainsi qu'une période pilote avec les contrôles manuels avant une planification autonome.
8. La surveillance permanente reste **DÉSACTIVÉE** jusqu'à réalisation de ces étapes et décision explicite.

Une couche LLM n'est pas nécessaire pour lire ces champs déterministes. Elle peut servir à diagnostiquer une modification de schéma, mais ne doit jamais déclarer des billets disponibles sans preuve API.

## Vérification indépendante de la salle IMAX Laser (17 novembre 2026)

Pathé Maroc indique explicitement que **Pathé Californie possède une salle IMAX Laser** : https://www.pathe.ma/fr/cinemas/ville/casablanca . IMAX indique aussi « IMAX with Laser » pour ce cinéma : https://www.imax.com/theatre/pathe-california-casablanca-and-imax . Cette double confirmation prouve la **capacité technique du cinéma**, et non que telle séance de Doomsday est assignée à cette salle.

La cartographie en attente doit donc vérifier sur une **véritable séance IMAX à Californie** que le tag détaillé `imax` correspond à cette salle, éventuellement en croisant `auditoriumName` ou les métadonnées publiques. Tant que ce rapprochement n'est pas fait, les notifications emploieront « IMAX (Laser non confirmé pour cette séance) » et ne promettront aucune disponibilité de sièges.
