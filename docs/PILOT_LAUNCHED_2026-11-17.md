# Pilote d'infrastructure lancé — 17 novembre 2026

Toutes les heures sont UTC. Le pilote technique est ACTIF ; la validation permanente et la validation métier IMAX Laser ne sont pas déclarées acquises.

## Réception Telegram confirmée

Le clic sur le message TEST envoyé à 21:30 a été reconnu dans le compte privé attendu, pour le bon message et le bon nonce. La confirmation est persistée à **21:41:54.330 UTC**. Elle est également attestée par le message « FAIT » du destinataire dans la conversation.

Le premier lecteur a échoué sur answerCallbackQuery car la fenêtre de réponse Telegram avait expiré. Correctif : conserver d'abord la preuve du clic valide, puis tenter de fermer la fenêtre sans faire dépendre la preuve de cette réponse facultative. Les tests couvrent désormais ce cas. Aucun nouveau TEST ni secret n'a été envoyé.

## Précontrôle et démarrage

À 21:45:31.113, le précontrôle a confirmé huit dates valides, aucune erreur, aucun message en attente et aucune séance Doomsday proposée à la réservation. Durée mesurée : **10 830 ms**. La fenêtre a ensuite été préparée sans heartbeat.

Un unique déclencheur Apps Script a été enregistré :
- Fonction : sentinelleInstrumentedPilotCycle.
- Déploiement : Head.
- Source : horaire, intervalle de cinq minutes.
- Notifications natives d'échec : configuration quotidienne conservée.
- Aucun déclencheur d'un autre projet n'a été modifié.

Le premier cycle de lancement, exécuté manuellement, a enregistré :
- **Début de fenêtre : 2026-11-17T21:51:22.708Z.**
- **Fin de fenêtre : 2026-11-18T21:51:22.708Z.**
- baselineCount = 3 : les trois mesures antérieures sont des précontrôles, à exclure des statistiques propres au pilote.
- Huit dates valides, aucune erreur ni livraison en attente, heartbeat ACKNOWLEDGED à 21:51:33.
- Durée totale Google affichée : 11,648 s.

## Première exécution réellement automatique

La page Exécutions affiche ensuite :
- Fonction sentinelleInstrumentedPilotCycle.
- Type **Déclencheur horaire**, et non Éditeur.
- Début affiché : **17 novembre 2026, 21:52:45**.
- État : **Terminée**.
- Durée totale Google : **10,756 s**.

Le journal de cette exécution contient :
- checkedAtUtc = 2026-11-17T21:52:46.369Z.
- datesChecked = validDetailedDays = 8 ; datesNotCheckedThisCycle = 0.
- coreErrorType = null, unknownDetailedDays = failedDetailedDays = 0.
- newReservableSessions = 0, delivery.pending = 0, errors = [].
- **watchdog = ACKNOWLEDGED** à 21:52:56.
- Mesure persistée : ms = 9730, h = 1, d = 8, f = u = p = 0.

L'interface Healthchecks a été vérifiée hors pause : **Up**, ping récent. Sa période préparée reste cinq minutes avec dix minutes de grâce. Aucun bouton Ping Now n'a été utilisé : les heartbeats proviennent des vrais contrôles sains.

L'ancien workflow GitHub conserve un cron dans sa source mais protège son job derrière SENTINEL_ENABLED. Sa dernière exécution planifiée exposée par l'API, run 44103455209 du 17/11 à 14:28:15, est **skipped**. Aucun contrôle GitHub concurrent actif n'a été observé ; les validations CI restent indépendantes.

## Borne de 24 heures et arrêt

Le code n'autorise le point d'entrée du pilote qu'avec une fenêtre préparée après confirmation Telegram et précontrôle sain. Une seconde préparation est refusée sans revue.

À partir de endsAtUtc, le garde-fou n'exécute plus le lecteur Pathé ni le heartbeat. Au premier passage après l'échéance, il place un message « Pilote 24 h terminé » dans la file existante, envoie les canaux et conserve les réessais en cas d'échec.

**Limite explicite : le garde-fou arrête la collecte, mais ne supprime pas le déclencheur et ne pause pas automatiquement Healthchecks.** Après l'échéance, le déclencheur ne sert qu'au statut expiré et aux éventuels réessais du message final. Lors de la revue, supprimer ce déclencheur et mettre Healthchecks en pause. Une alerte DOWN après cette fin programmée correspond à l'arrêt attendu ; le message de fin l'explique. Aucune nouvelle clé de gestion Healthchecks ni permission ScriptApp n'a été ajoutée pour automatiser sa pause.

Les alertes métier restent actives pendant la fenêtre sur les signaux officiels validés. Aucun achat ou choix de siège n'est automatisé.

## Tests et suite

[CI complète réussie](https://github.com/Tommy1er/sentinelle-doomsday/actions/runs/44182853753), commit f57941e6a43f1a06336c1d7f02f28ca8d941795d. Tests locaux et CI : confirmation Telegram malgré popup expirée, gate de réception, préparation unique, frontière exacte à 24 heures, aucun lecteur/heartbeat après expiration, message de fin unique et réessais.

Ce résultat prouve le lancement et un premier passage automatique sain. Il ne prouve pas encore une cadence régulière sur 24 heures, le p95 de production, la compatibilité avec les quotas cumulés de tous les projets Google du compte ou la réception d'une future alerte de vente réelle.

La revue doit utiliser la fenêtre UTC, baselineCount et les métriques persistées, inspecter les lacunes de cadence et l'historique Healthchecks, puis décider du GO technique. Le mapping d'une vraie séance IMAX vers IMAX Laser reste une validation séparée.

Aucune automatisation ChatGPT, ressource payante, réservation ou fusion vers main. L'onglet créé pour cette intervention a été fermé après vérification.
