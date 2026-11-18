# Mesures réelles Apps Script et revue du quota

Le 18 novembre 2026 à 22:33 UTC, cinq paires de mesures ont été exécutées dans le projet Apps Script privé. Le projet contenait le moteur séquentiel du pilote. Le fichier manuel QuotaBenchmark.gs utilise les helpers de lecture et de parsing de la PR dans une portée isolée. Les déclencheurs et les notifications sont restés désactivés.

| Volumétrie | Mesures en ms | Moyenne | Maximum |
| --- | --- | ---: | ---: |
| 8 dates | 2781, 868, 875, 722, 554 | 1160 ms | 2781 ms |
| 20 dates | 3297, 2230, 1678, 1583, 1396 | 2036,8 ms | 3297 ms |

Les dix lectures du calendrier et les 140 lectures de dates ont renvoyé HTTP 200. Zéro date en erreur ou inconnue, zéro séance dans les réponses. Une exécution à froid distincte à huit dates a pris 2685 ms. La série rapprochée mesure le réseau et le parsing. Les durées internes omettent le démarrage de chaque déclenchement, les écritures, l'envoi des alertes et Healthchecks. Le pilote mesurait 13,53 s par déclenchement Google pour le moteur complet antérieur. Ces mesures ne suffisent pas à chiffrer la durée complète de la version parallèle.

## Budget de l'identité d'exécution

Le compte Apps Script connecté affiche sept déclencheurs personnels, dont cinq horaires et deux de feuille de calcul. Sur la fenêtre du pilote, le rapprochement du projet, de la fonction et du type d'exécution a trouvé 313 lignes correspondant à cinq de ces fonctions, pour 101 min 36,615 s. Le journal global ne permet pas d'attribuer chaque ligne à son utilisateur d'exécution. Il n'expose pas le solde du quota. Google précise qu'un déclencheur installable s'exécute sous le compte de son créateur. [Documentation Google](https://developers.google.com/apps-script/guides/triggers/installable)

## Décision

Les essais réseau à 8 et 20 dates sont réussis. Le GO permanent reste bloqué sur le compte partagé. Le moteur complet optimisé doit encore être mesuré sous une identité dont le budget est établi. Un compte dédié isolerait le budget des autres scripts. Il reste à le choisir et à vérifier son accès et la livraison des alertes sous cette identité.

## Prévalidation du moteur installé

Le 18 novembre à 22:40 UTC, le moteur parallèle et le watchdog corrigé de la PR ont été installés dans le projet privé avec le point d'entrée permanent. Les fichiers enregistrés ont été relus et comparés aux sources. Le cycle manuel complet, hors heartbeat, a contrôlé huit dates en **4,070 s** mesurées. Huit dates valides, zéro erreur, zéro ouverture, zéro notification en attente. Le point d'entrée permanent a renvoyé **DISABLED** lors de la vérification. Aucun déclencheur n'a été créé. La durée à vingt dates reste celle du benchmark de lecture.
