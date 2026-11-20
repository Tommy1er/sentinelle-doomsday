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

## Mise en service (environ 20 minutes) — version révisée après audit expert

> **Règle d'identité :** un déclencheur Apps Script s'exécute sous le compte Google **qui le crée**, et c'est le quota de ce compte qui est consommé. Toutes les étapes ci-dessous se font donc connecté au compte retenu pour la production. S'il s'agit du compte dédié, créer d'abord un nouveau projet Apps Script sous ce compte et y recréer les Script Properties.

0. **Sécurité :** dans @BotFather, faire `/revoke` sur le bot, puis mettre le nouveau jeton dans `TG_BOT_TOKEN`. L'ancien jeton a été visible sur une capture.
1. Dans le projet Apps Script, remplacer ou créer ces **sept** fichiers avec le contenu de la branche `claude/expert-audit-20261120` : `google_apps_script_sentinel.gs`, `google_apps_script_showtime_signal.gs`, `google_apps_script_booking_monitor.gs`, `google_apps_script_watchdog.gs`, `google_apps_script_pilot_metrics.gs`, `google_apps_script_production.gs` et le nouveau `google_apps_script_deploy_check.gs`.
2. Exécuter `sentinelleDeploymentReport()` et accepter les autorisations demandées (déclencheurs, adresse du compte). Attendu : `verdict: "READY_TO_ENABLE"`, `problems: []`, `reportRunBy` = le compte retenu, et `codeFingerprintInstalled` identique à l'empreinte affichée par la CI (étape « Deployment evidence… ») pour le commit installé. Si `CODE_FINGERPRINT_MISMATCH` apparaît, un fichier n'a pas été copié en entier ou vient d'un autre commit. S'il reste un déclencheur de pilote (`EXPIRED_PILOT_TRIGGER_PRESENT`), le supprimer.
3. Exécuter `sentinelleCheckWithBookingOnce()` une fois. Attendu : `cinemaProgramme: "NO_PROGRAMME_FOR_CINEMA"`, `validDetailedDays: 8`, `failedDetailedDays: 0`, `anomalyDetailedDays: 0`, `delivery.pending: 0`.
4. Exécuter `sentinelleTestNotifications()`. Vérifier sur le téléphone que le message Telegram **commence par** « 🧪 [DOOMSDAY] TEST », et vérifier la réception dans Gmail.
5. Script Properties : `DOOMSDAY_PRODUCTION_ENABLED = true`. Facultatif : `DOOMSDAY_PRODUCTION_UNTIL = 2027-01-15T00:00:00Z` pour l'arrêt automatique. Après cette date, le script envoie un message 🛑 (réessayé jusqu'à ce qu'il soit livré), puis supprime le déclencheur, au plus tard 24 h après. Si le rapport affiche `CLOSEOUT_INCOMPLETE_…`, lancer `sentinelleProductionTick()` à la main, ou supprimer le déclencheur dans la page « Déclencheurs ». Il met aussi Healthchecks en pause si `HC_API_KEY` contient une clé API Healthchecks en lecture-écriture (facultatif ; sinon, le faire à la main).
6. Déclencheurs : créer **un seul** déclencheur temporel sur `sentinelleProductionTick`, toutes les 5 minutes, avec notification d'échec « immédiate ».
7. Healthchecks.io : réactiver le check (période 5 min, tolérance 15 min), avec alertes vers Telegram **et** e-mail.
8. Relancer `sentinelleDeploymentReport()` tout de suite. Attendu : `verdict: "ENABLED_AWAITING_EVIDENCE"`, `pendingEvidence: ["NO_AUTOMATIC_RUN_YET"]`, `productionTriggerCount: 1`.
9. Après environ 10 minutes, le relancer. Attendu : `verdict: "LIVE_VERIFIED"`, avec `lastAutomaticRun.identity` = le compte retenu, `lastAutomaticRun.watchdog` = `"ACKNOWLEDGED"` et la même empreinte. Dans « Exécutions », ce cycle doit apparaître comme lancé par un déclencheur temporel. Healthchecks doit être « UP ». **Ce n'est qu'à ce moment que la surveillance est réellement en service.**
10. Test de la vraie panne (facultatif mais recommandé) : mettre `DOOMSDAY_PRODUCTION_ENABLED = false`. Healthchecks doit alerter dans les 20 minutes environ. Remettre `true` et vérifier le retour à « UP ».
11. Téléphone : dans Telegram, mettre la conversation du bot en exception du mode « Ne pas déranger » / Concentration, avec une sonnerie distincte.
12. Après 24 h, faire deux vérifications :
    - `sentinelleDeploymentReport().last24h.cycles` ≥ 280 ;
    - **le quota réel, mesuré par Google** : dans Apps Script, page « Exécutions », filtrer le type « Déclencheur » sur les dernières 24 h et additionner les durées. Faire de même pour **chaque autre projet du compte** qui a des déclencheurs. Le total doit rester sous 60 min, ce qui laisse 30 min de marge sur les 90.

    Repère sans valeur de preuve : `estimatedGoogleBilledMinutes` (calibré sur le pilote). Si Google donne au moins 20 % de plus, le signaler. `measuredWrapperRuntimeMinutes` est le chronomètre interne et ne représente **pas** le quota.

**Arrêt d'urgence :** mettre `DOOMSDAY_PRODUCTION_ENABLED = false` (effet au cycle suivant), puis supprimer le déclencheur et mettre Healthchecks en pause.

**Ce que dit chaque alerte :**
- 🚨 réservation ouverte : lien officiel fourni, réserve tout de suite.
- ⚠️ « vente peut-être ouverte / vérifie MAINTENANT » : la fenêtre de vente est ouverte mais le format a changé. Va sur pathe.ma ou l'appli.
- 📅 séances publiées : ventes pas encore ouvertes, avec l'heure d'ouverture annoncée. Une alerte 🚨 suivra.
- 🎯 IMAX : la salle porte le nom IMAX. Le Laser se confirme sur la page de réservation.

## Pour aller plus loin (recommandé)

- **Deuxième sentinelle indépendante** : installer le même projet sous un second compte Google (par exemple la boîte d'envoi dédiée), avec son propre déclencheur décalé de 2 à 3 minutes. Cela donne un quota de 90 min/jour séparé, une détection toutes les 2 à 3 minutes environ et aucun point de panne unique côté Google. Doublons possibles : un même événement peut arriver deux fois.
- Quota : le pilote consommait environ 65 min/jour sur les 90 min du compte, et le reste des scripts Apps Script du compte puise dans le même budget. Si Healthchecks signale des trous dans la journée, la seconde sentinelle règle le problème.
