# Sentinelle Doomsday — protocole de pilote 24 h et critères GO/NO-GO

Date de rédaction : 17 novembre 2026. Statut : **préparation seulement**. Aucun déclencheur créé, aucun Healthchecks réactivé, aucun message réel supplémentaire émis par ce document.

## Situation vérifiée

- Source : `docs/IMAX_AND_PILOT_READINESS_2026-11-17.md` ; rapport de déploiement : `docs/PR4_LIVE_DEPLOYMENT_AND_WATCHDOG_2026-11-17.md`.
- PR #4 : `fix/doomsday-critical-audit-20261117`, pas fusionnée vers main.
- Le moteur correctif et les composants `ImaxAudit.gs`, `PilotMetrics.gs`, `Watchdog.gs` sont installés dans le projet Google Apps Script existant, selon les comptes rendus Work.
- Le premier cycle instrumenté du 17/11 à 21:06:30 UTC a contrôlé 8 dates en 10,733 s, sans dégradation ; un **seul** échantillon a été persisté. Cela ne préjuge pas des durées à 20 dates.
- La recherche IMAX a contrôlé 31 films sans tag IMAX détecté à Californie. C'est un résultat négatif **dans la cohorte**, non une preuve d'absence d'IMAX ou une validation du mapping IMAX/Laser.
- Healthchecks : période 5 min + grâce 10 min, **en pause**. Un test antérieur du watchdog DOWN a produit un email effectivement reçu.
- Aucun déclencheur Google Apps Script à la clôture du dernier rapport. Pilote 24 h non lancé. Réception Telegram sur écran de téléphone non confirmée.

## Distinction cruciale entre deux validations

**Pilote d'infrastructure** : mesure de la cadence, du temps d'exécution, de la fraîcheur de la donnée, des erreurs, des livraisons et du watchdog. Il peut être mené sans film IMAX actuellement à l'affiche, à condition de ne pas annoncer de validation IMAX.

**Validation métier finale** : exige au minimum une séance réellement taguée IMAX à Californie pour vérifier le lien séance ↔ salle IMAX Laser, les statuts de vente, et l'alerte correspondante ; l'absence de témoin au 17 novembre bloque cette validation spécifique mais ne doit pas être déguisée en échec du pilote technique.

## Avant tout démarrage : vérifications manuelles

1. Confirmer dans l'éditeur Google Apps Script que la version PR #4 corrigée est installée **et qu'aucun fichier n'est vide** (incident antérieur de BookingIntegration), ainsi que le classificateur et les helpers.
2. Exécuter `sentinelleInstrumentedCheckOnce()` sans heartbeat. Vérifier `datesChecked=8`, zéro erreur détaillée et `delivery.pending=0`. Confirmer qu'aucun message ne prétend que des sièges sont en vente en absence de signal.
3. Dans le téléphone du destinataire, confirmer la **réception visible** du message Telegram TEST, sans créer un nouvel envoi Gmail si le premier a déjà été reçu. Si le jeton Telegram a été remplacé, vérifier les propriétés privées et refaire un test limité et explicitement marqué TEST.
4. Dans Healthchecks, confirmer le contrôle attendu et l'intégration email, **puis définir l'état souhaité du pilote**. Si la surveillance de panne fait partie du pilote, il faut dépauser Healthchecks au moment du départ ; un contrôle pausé ne valide pas les alarmes d'absence de ping.
5. Vérifier la page des déclencheurs : zéro déclencheur avant le départ ; s'assurer qu'un éventuel ancien cron GitHub et la tâche ChatGPT récurrente restent désactivés.
6. Relever la dernière ligne `sentinellePilotMetrics()` et l'heure de départ UTC. Les métriques préexistantes ne doivent pas être confondues avec celles du pilote.

## Définition du pilote (après autorisation explicite)

- **Une seule** tâche Apps Script de type time-driven, toutes les cinq minutes, ciblant `sentinelleInstrumentedPilotCycle` ; pas `sentinelleCheckOnce` ni le wrapper simple, car ils n'apportent pas l'ensemble de la télémétrie.
- Healthchecks 5 min + 10 min de grâce, sorti de pause si l'on valide réellement son fonctionnement. Le watchdog ne ping que sur un cycle complètement sain ; ses alarmes peuvent donc révéler aussi une couverture partielle, pas nécessairement un arrêt de Google.
- 24 heures UTC, avec journal du début, des éventuels incidents, de la fin et de l'arrêt. **Ne pas créer de rappel ChatGPT**.
- Conserver toutes les alertes de billetterie réelles ; toute notification de test doit être clairement étiquetée `TEST`.
- Pour toute date détaillée : URL Pathé officielle uniquement, aucun achat ni automatisation des sièges.

## Mesures à conserver

| Indicateur | Source | Sens et limite |
|---|---|---|
| Nombre d'exécutions sur 24 h | `sentinellePilotMetrics()` | 288 théoriques à 5 min ; les déclencheurs Apps Script sont susceptibles de dériver |
| Dernière réussite du cœur et du détaillé | Script Properties/rapport | Mesure la fraîcheur, non l'heure d'ouverture de la billetterie |
| Latence p95, max et total d'exécution | `sentinellePilotMetrics()` | Un seul échantillon ne permet pas de conclure |
| Intervalle maximum entre deux cycles | `maxObservedGapSeconds` | Ne mesure que les cycles effectivement enregistrés |
| Contrôles sains / dégradés | `healthySamples` et `degradedOrFailedSamples` | Chaque erreur doit être classifiée ; pas de succès sur 404 inconnu |
| Couverture détaillée | `datesChecked`, `datesNotCheckedThisCycle` | La rotation >20 dates est traitée comme dégradée pour le watchdog actuel |
| Alertes réellement reçues | Gmail + Telegram (écran téléphone) | `ok=true` Telegram signifie acceptation côté API, pas lecture sur téléphone |
| Healthchecks | Historique des pings et alertes DOWN | Contrôle indépendant de l'exécution Google, si dépausé |

## Seuils de revue prudents (objectifs à discuter, non résultats)

- Zéro erreur de détection classée à tort en « aucune séance ».
- Zéro alerte métier dépourvue de preuve `status + fenêtre active + refCmd` officiel.
- Aucune panne d'exécution restant invisible au-delà de la période de 5 min + 10 min de grâce, une fois le watchdog activé.
- Examiner immédiatement toute lacune de cadence dépassant 15 minutes, toute perte de canal ou toute exécution >30 secondes ; ces seuils sont des **seuils d'investigation**, pas des garanties propres au service.
- Les durées **réelles** doivent tenir dans les quotas du compte Google partagé, notamment 90 minutes quotidiennes de temps de déclencheurs pour un compte personnel. Une montée de 8 à 20 dates doit faire l'objet d'une extrapolation prudente, puis d'une mesure réelle, avant GO.
- Aucun GO sur la « couverture totale » si >20 dates imposent une rotation partielle et que le watchdog refuse tout heartbeat ; il faut une politique de santé couvrant une rotation complète, avec tests adversariaux, ou limiter les dates selon une règle justifiée.

## Arrêt, reprise et incidents

- Stop manuel du pilote : supprimer le déclencheur installé, puis mettre Healthchecks en pause afin d'éviter des alertes de panne volontaire.
- Incident réel : préserver journal et état persistant ; ne pas réinitialiser aveuglément la file d'alertes ni écraser les clichés de réservation.
- Incident watchdog : ne pas envoyer de ping artificiel `/success` pour « remettre au vert » un contrôle réellement dégradé.
- En cas de nouvelle fiche film / nouveau slug, ou de métadonnées commerciales inconnues : alerte de changement de schéma et intervention humaine ; aucune autodécision d'achat.

## Critères de sortie

**Pilote technique GO** seulement après un cycle effectif de 24 heures vérifié, réception des alertes canaux testées, mesure des quotas et watchdog indépendant observé hors pause. **GO métier IMAX** distinct : identification d'une vraie séance IMAX/Laser à Californie, correspondance du format et test de l'alerte. Le pilote peut être techniquement concluant tout en laissant l'IMAX en attente.

La surveillance permanente restera **désactivée** tant qu'une décision GO fondée sur les preuves et les risques résiduels n'aura pas été actée.
