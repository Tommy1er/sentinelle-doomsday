# Mise en service — Sentinelle Doomsday (révision fail-open du 20 novembre 2026)

## Situation au 20 novembre 2026

- **Rien ne surveille Pathé en ce moment.** Le pilote s'est terminé le 18 novembre : zéro déclencheur Apps Script, Healthchecks en pause, production désactivée.
- L'API Pathé Maroc répond encore `{}` pour Doomsday à Californie : rien n'a été manqué.
- En France, Pathé a **déjà ouvert les préventes** (sortie le 16 décembre). L'ouverture au Maroc peut donc arriver à tout moment.
- La version `main` (Playwright sur GitHub Actions) ne sert à rien : Pathé bloque les runners GitHub (HTTP 403), et GitHub ne lance la tâche planifiée que toutes les 6 à 9 heures. Le vrai moteur est celui d'Apps Script.

## Ce que change cette révision

Le moteur était réglé pour ne **jamais** envoyer de fausse alerte, quitte à rester muet devant un format imprévu. Pour réserver une place, la seule vraie erreur est de **rater** l'ouverture. Les réglages vont désormais dans ce sens :

| Situation | Avant | Maintenant |
| --- | --- | --- |
| Pathé publie des séances, ventes pas encore ouvertes | Silence | Alerte 📅 avec l'heure d'ouverture des ventes (heure de Casablanca) |
| Nouvelle forme de lien de réservation, fenêtre de vente manquante ou sans fuseau | Date entière rejetée, message vague « couverture dégradée » au bout de 15 min | Séance conservée, alerte normale |
| Séance de minuit rangée sous la veille | Date entière rejetée | Séance conservée |
| Plus d'environ 40 séances le même jour | Date rejetée à chaque cycle | Jusqu'à environ 140 séances par jour |
| Contenu illisible pour la sentinelle | Échec silencieux | Alerte ⚠️ immédiate « vérifie MAINTENANT » |
| Ouverture détectée la nuit | Un seul message | Rappel Telegram toutes les 5 min (12 fois maximum) jusqu'à « ✅ J'ai vu » ou une réponse |
| Champ ajouté par Pathé à la racine de `/cinemas` | Calendrier en erreur | Ignoré si Californie est présent |
| Avant-première signalée (`specialShowtime`) | Ignorée | Mentionnée dans l'alerte |

Les garde-fous restent les mêmes : aucun lien hors domaine Pathé n'est montré, aucun achat ni choix de siège automatique, les secrets restent dans les Script Properties.

## Mise en service (environ 15 minutes, dans le projet Apps Script privé)

1. Remplacer le contenu de ces trois fichiers par celui de cette branche : `google_apps_script_sentinel.gs`, `google_apps_script_showtime_signal.gs`, `google_apps_script_booking_monitor.gs`. Les autres fichiers (watchdog, production, métriques) restent tels quels. Seul `pilot_metrics` reçoit une correction mineure d'affichage.
2. Exécuter `sentinelleCheckWithBookingOnce()` une fois à la main. Attendu : `cinemaProgramme: "NO_PROGRAMME_FOR_CINEMA"`, `validDetailedDays: 8`, `failedDetailedDays: 0`, `anomalyDetailedDays: 0`, aucun message.
3. Script Properties : `DOOMSDAY_PRODUCTION_ENABLED = true`.
4. Déclencheurs : supprimer celui du pilote s'il existe encore, puis créer **un seul** déclencheur temporel sur `sentinelleProductionTick`, toutes les 5 minutes.
5. Healthchecks.io : réactiver le check (période 5 min, tolérance 15 min) et vérifier que ses alertes partent vers Telegram **et** e-mail. C'est le seul moyen d'être prévenu si Google arrête d'exécuter le script.
6. Téléphone : dans Telegram, mettre la conversation du bot en exception du mode « Ne pas déranger » / Concentration, avec une sonnerie distincte.

## Pour aller plus loin (recommandé)

- **Deuxième sentinelle indépendante** : installer le même projet sous un second compte Google (par exemple la boîte d'envoi dédiée), avec son propre déclencheur décalé de 2 à 3 minutes. Cela donne un quota de 90 min/jour séparé, une détection toutes les 2 à 3 minutes environ et aucun point de panne unique côté Google. Doublons possibles : un même événement peut arriver deux fois.
- Quota : le pilote consommait environ 65 min/jour sur les 90 min du compte, et le reste des scripts Apps Script du compte puise dans le même budget. Si Healthchecks signale des trous dans la journée, la seconde sentinelle règle le problème.
