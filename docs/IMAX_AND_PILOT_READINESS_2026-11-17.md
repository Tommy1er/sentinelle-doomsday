# Préparation du pilote : IMAX et mesures — 17 novembre 2026

Toutes les heures ci-dessous sont UTC. Ce rapport complète PR4_LIVE_DEPLOYMENT_AND_WATCHDOG_2026-11-17.md.

## Recherche IMAX réellement exécutée

Le diagnostic manuel `sentinelleAuditImaxOnce()` est publié dans tools/google_apps_script_imax_audit.gs et installé dans ImaxAudit.gs du projet Google existant.

Résultat à **21:02:25.391 UTC** :
- 31 films du catalogue officiel, tous contrôlés, sans troncature et sans erreur.
- Durée : 5 079 ms.
- Tags de programmation observés à Californie : 4dx, DEFAULT, PREMIUM, pmr, vip_fr.
- Zéro couple film/date portant un tag IMAX ; donc aucun appel détaillé IMAX sélectionné et aucune séance IMAX témoin validée.
- Aucune notification, heartbeat, réservation ou achat.

Limite importante : le diagnostic filtre les candidats sur les tags de programmation IMAX. Il ne prouve pas qu'aucune séance n'existe si le site encode la technologie autrement ou ne la publie pas dans ces tags. Il ne permet pas non plus d'assimiler PREMIUM à IMAX ou Laser. La recherche d'une vraie séance témoin reste ouverte.

## Instrumentation installée et testée

tools/google_apps_script_pilot_metrics.gs est installé dans PilotMetrics.gs, avec persistance vérifiée après rechargement. Il ne crée aucun déclencheur.

- `sentinelleInstrumentedCheckOnce()` mesure un cycle réel sans heartbeat ; il préserve donc la pause Healthchecks.
- `sentinellePilotMetrics()` relit les statistiques persistantes.
- `sentinelleInstrumentedPilotCycle()` est un point d'entrée candidat pour le futur pilote ; il n'a pas été planifié ni exécuté ici.

Les mesures conservent au maximum 288 observations dans six propriétés segmentées, remplacées observation par observation. Le résumé fournit durée totale, p95, maximum, intervalle maximal observé entre deux échantillons, couverture et nombre de cycles dégradés. Il ne faut pas confondre 288 emplacements avec une preuve d'exécution de 24 heures.

Premier cycle manuel instrumenté :
- Début **21:06:30.603 UTC**, durée **10 733 ms**.
- Huit dates candidates et valides ; aucune date inconnue ou en échec ; aucune couverture partielle.
- Aucune séance Doomsday proposée à la réservation dans les réponses observées.
- Aucun envoi Telegram/Gmail et aucune notification en attente.
- Santé : 1 ; heartbeat : NOT_SENT_MANUAL_CHECK.

À **21:09:35 UTC**, une exécution séparée du résumé a relu **une observation persistante**, une saine et zéro dégradée, 10,733 secondes cumulées. Le p95 d'un seul échantillon n'a aucune portée de dimensionnement. Aucun résultat de pilote de 24 heures n'est revendiqué.

## Watchdog préparé, toujours en pause

Le réglage Healthchecks a été enregistré et confirmé dans l'interface :
- Période attendue : **5 minutes**.
- Grâce : **10 minutes**.
- État : **paused**.

Ce réglage remplace celui du test de panne précédent (1 minute + 1 minute). Aucun ping artificiel n'a été envoyé pour faire afficher Up. Le test externe DOWN reçu dans Gmail plus tôt reste documenté dans le rapport précédent.

## Validation et clôture

[CI complète réussie](https://github.com/Tommy1er/sentinelle-doomsday/actions/runs/44176168909), commit 9b23c04582f838169bf29312ff878e3d8d603b83. Les nouveaux tests couvrent notamment la rétention après 289 écritures, le stockage borné, l'exclusion des observations périmées, le percentile, l'absence de heartbeat manuel, l'enregistrement des erreurs sans leur texte privé et la libération du verrou.

Les scénarios d'intégration, de résilience, de rappels persistants et du watchdog ont également passé les contrôles locaux pertinents. Les tests logiciels utilisent des transports simulés ; les preuves Apps Script ci-dessus sont des exécutions réelles.

La page des déclencheurs indique **zéro déclencheur** à la clôture. L'onglet temporaire de travail est fermé ; l'onglet Apps Script d'origine est conservé.

## Conditions avant pilote

L'attribution d'une séance réelle IMAX/Laser reste non vérifiée. La confirmation de réception Telegram sur le téléphone n'est pas établie par cette intervention. Le pilote instrumenté de 24 heures n'a pas commencé et aucune surveillance permanente n'est active. Les secrets existants restent dans les propriétés privées ; aucune nouvelle automatisation ChatGPT ni aucun service payant n'a été créé.
