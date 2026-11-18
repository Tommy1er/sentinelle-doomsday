# Point intermédiaire du pilote — 18 novembre 2026, vers 12:00 UTC

Contrôle en lecture seule : aucun changement du code déployé, des propriétés, des déclencheurs ou de Healthchecks. Seule la fonction de résumé existante, qui lit les métriques et écrit son journal d'exécution, a été appelée ; elle ne lance pas le détecteur et n'ajoute pas d'échantillon.

## Fenêtre et échantillon

Fenêtre persistée inchangée : 17/11/2026 21:51:22.708 UTC → 18/11/2026 21:51:22.708 UTC, état RUNNING, baselineCount=3.

Le résumé brut lu à 11:59:42 comptait 174 mesures. Les six segments existants de métriques ont ensuite été lus dans l'interface Script Properties, en ne sélectionnant que les clés de métriques et de fenêtre. Aucun secret ni configuration de canal n'a été extrait ou publié.

Le recalcul filtre strictement les timestamps dans la fenêtre du pilote et exclut les trois précontrôles.

| Indicateur | Observation provisoire |
| --- | --- |
| Mesures du pilote | 171, incluant le cycle manuel initial |
| Mesures saines | 171 |
| Mesures dégradées ou échouées enregistrées | 0 |
| Premier échantillon | 17/11 21:51:23.104 UTC |
| Dernier échantillon | 18/11 11:57:46.502 UTC |
| Période observée | Environ 14 h 06 min |
| Durée p95, rang supérieur | 17 560 ms |
| Durée maximale | 40 518 ms |
| Durée cumulée des mesures du pilote | 1 907,421 s, soit environ 31,79 min |
| Intervalle maximal entre échantillons | 322,627 s, soit environ 5 min 23 s |
| Intervalles supérieurs à 15 min | 0 |

Les durées sont celles mesurées à l'intérieur du wrapper, pas une facture exacte de temps de déclencheurs Google. Le total n'inclut pas le temps des autres projets du compte et ne prouve pas le respect futur du quota partagé.

Le maximum brut d'intervalle de 1 521,934 s donné par le résumé initial provenait des précontrôles : il ne doit pas être présenté comme une interruption du pilote.

## Lenteur à conserver pour la revue

Un cycle dépasse le seuil d'investigation de 30 secondes :
- 18 novembre à 09:37:48.272 UTC.
- Durée mesurée : 40 518 ms.
- Santé = 1 ; huit dates ; zéro date en échec ou inconnue ; zéro livraison en attente.

Cette observation isolée n'établit pas la cause de la lenteur. Elle ne justifie pas à elle seule de modifier le moteur pendant l'endurance, puisque le cycle a terminé sain et que la cadence observée est restée dans la marge de surveillance. À analyser au bilan avec les autres durées et éventuels logs disponibles.

## Watchdog

Healthchecks consulté lors de ce point : **Up**, dernier ping affiché trois minutes auparavant. Le compteur mensuel reste à une interruption de 39 secondes, correspondant au test DOWN antérieur déjà documenté ; aucun nouveau DOWN n'est reflété dans ce compteur.

Ce constat est un point intermédiaire et non une promesse sur les heures suivantes.

## Décision intermédiaire

Poursuivre le pilote inchangé jusqu'à son échéance du 18 novembre à 21:51:22 UTC. Ne pas prononcer de GO technique définitif avant les 24 heures effectives. Validation métier IMAX Laser toujours séparée.

À la clôture : conserver les métriques et leur fenêtre, analyser cadence/p95/lenteurs/erreurs, supprimer l'unique déclencheur et mettre Healthchecks en pause conformément au rapport de lancement. Ces deux dernières actions ne sont pas programmées dans ChatGPT.

L'onglet créé pour ce contrôle a été fermé. Aucune modification du moteur ni message de test supplémentaire.
