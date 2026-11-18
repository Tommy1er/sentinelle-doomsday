# Bilan des 24 heures du pilote Doomsday

Fenêtre du 17 novembre 2026 à 21:51:22.708 UTC au 18 novembre à 21:51:22.708 UTC.

| Indicateur | Résultat |
| --- | --- |
| Cycles sains | 288 sur 289 (99,65 %), lancement manuel inclus |
| Premier et dernier échantillon | 17/11 21:51:23.104 et 18/11 21:47:46.660 UTC |
| Plus grand intervalle | 5 min 22,627 s |
| Durée p95 | 19,016 s |
| Durée maximale | 40,518 s |
| Durée cumulée instrumentée | 54 min 55,689 s |

Le [CSV](PILOT_METRICS_2026-11-18.csv) combine la capture intermédiaire et le tampon final, avec déduplication par horodatage et filtrage sur la fenêtre. Le total de 289 correspond au compteur final de 292 moins les trois précontrôles. Le tampon final contenait 288 lignes, et le relevé précédent a permis de récupérer la première mesure du pilote.

## Incidents et clôture

À 16:17 UTC, le journal du détecteur atteste huit dates valides, zéro erreur Pathé et zéro livraison en attente. Aucun accusé Healthchecks n'a suivi. L'exception est survenue après le retour du détecteur, dans le chemin du heartbeat. Le code masque le détail de l'exception, ce qui empêche de distinguer un problème de transport d'une réponse inattendue. Le délai entre mesures est resté sous la tolérance d'alerte. Deux cycles sains ont dépassé 30 s, à 09:37 (40,518 s) et à 21:02 (36,430 s). Les mesures ne permettent pas de décomposer ces durées par service.

À 21:52:47 UTC, le journal de fin indique EXPIRED et un envoi réussi sur chaque canal, Telegram et Gmail, sans livraison en attente. Healthchecks a ensuite été mis en pause et son état a été vérifié. Le déclencheur temporaire a été retiré. Apps Script affiche zéro déclencheur.

## Décision

Le pilote valide le fonctionnement technique de la collecte et des alertes avec une réserve sur le diagnostic du heartbeat. La mise en service permanente reste à décider après revue du budget du compte. Les 54 min 56 s mesurées incluent le lancement manuel et ne représentent pas la consommation totale facturée aux déclencheurs de ce compte. Le plafond des comptes personnels est de 90 min par jour et par utilisateur, partagé entre les projets. [Quotas Apps Script](https://developers.google.com/apps-script/guides/services/quotas)

Une vraie séance IMAX Laser et une ouverture Doomsday restent à observer. Le moteur déployé n'a pas été modifié pendant le test.
