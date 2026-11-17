# Déploiement PR4 et watchdog — 17 novembre 2026

Ce rapport remplace les limites de déploiement consignées lors de l'intervention précédente dans CRITICAL_FIXES_AND_WATCHDOG_STATUS_2026-11-17.md. Toutes les heures sont UTC.

## Installation et contrôles réels

Le moteur corrigé PR4, son classificateur, le lecteur détaillé et le client watchdog sont installés dans le projet Google Apps Script existant. Les propriétés privées et la file d'alertes sont conservées. La sonde indique la base source fb217c01beaf7b42e24debfe773ce2400c419a30 ; le catalogue manuel a été ajouté ensuite.

| Contrôle | Début | Résultat |
| --- | --- | --- |
| Cycle intégré 1 | 11:41:46.551 | 7 847 ms, huit dates valides, aucune erreur |
| Cycle intégré 2 | 11:42:19.212 | 6 641 ms, huit dates valides, aucune erreur |
| Témoin positif en lecture seule | 11:43:16.060 | 525 ms, deux séances available avec liens officiels |
| Cycle intégré avec watchdog | 11:55:39.147 | Huit dates valides, ACKNOWLEDGED à 11:55:47 |

Les huit ancres du 13 au 20 décembre sont toutes lues : zéro séance Doomsday, zéro date inconnue ou en échec, zéro couverture partielle, zéro notification en attente. Les deux premiers contrôles prennent en moyenne 7 244 ms. Une extrapolation à 288 contrôles donne 34,77 minutes/jour, mais deux mesures ne constituent ni un p95 ni une garantie de quota.

Le témoin Comment braquer une banque, le 17 novembre, fournit deux séances (17h30 VF et 22h30 VOSTFR), toutes deux proposées à la réservation. Ce contrôle n'envoie aucune notification et ne modifie pas la cible.

Lors de l'ajout du fichier Watchdog, une manipulation de l'éditeur a vidé BookingIntegration. Deux tentatives à 11:51 et 11:53 ont échoué sans heartbeat. Le fichier a été restauré depuis la source vérifiée, son contenu confirmé après rechargement, puis le cycle intégré de 11:55 a réussi. Aucun déclencheur n'était actif pendant l'incident.

## Watchdog externe réellement testé

Un compte Healthchecks et un contrôle privé avec intégration email ont été configurés. L'URL de ping est conservée uniquement dans HC_PING_URL, propriété privée du script. Aucun identifiant secret n'est publié ici.

1. Le cycle sain de 11:55 a envoyé un heartbeat accepté ; l'interface a affiché Up.
2. Aucun autre heartbeat n'a été envoyé volontairement.
3. Avec une période TEST d'une minute et une grâce d'une minute, Healthchecks a basculé Down.
4. L'email « DOWN | Sentinelle Doomsday — TEST panne » est arrivé dans Gmail à 11:57:48 UTC, dans la boîte de réception. Le contenu confirme l'absence du signal attendu.
5. Le contrôle a ensuite été mis en pause, état confirmé à la clôture.

Ce résultat valide une véritable alerte externe d'absence de heartbeat, et non seulement une simulation logicielle. Le contrôle porte désormais le nom « Sentinelle Doomsday — contrôle de santé ». Sa dernière configuration vérifiée reste celle du test : 1 minute + 1 minute, EN PAUSE. Le réglage opérationnel devra être changé et vérifié avant tout pilote.

## Recherche de fiche alternative

Le diagnostic manuel /api/shows exécuté à 11:57:36.684 a observé 32 films et un seul candidat Doomsday : avengers-doomsday-55389, sortie MA_FR 2026-12-16. Aucune substitution automatique de cible. Cette observation ne garantit pas l'absence de fiches non listées ou futures.

## Validation du dépôt

[CI réussie sur le dernier ajout de code](https://github.com/Tommy1er/sentinelle-doomsday/actions/runs/44078579311), commit 44a083d2e56168a5b8c3f016c7fbb212eb65aa12. Les tests réseau simulés restent distincts des preuves réelles ci-dessus.

## Statut opérationnel et limites

- Zéro déclencheur Apps Script vérifié après les essais. Aucun pilote ni surveillance permanente activé.
- Watchdog en pause pour éviter une alerte permanente pendant l'arrêt volontaire.
- Attribution d'une véritable séance à l'IMAX Laser encore à confirmer.
- Pilote instrumenté de 24 heures non démarré ; fréquence et budget encore à valider sur durée.
- Réception Telegram sur téléphone non confirmée dans cette intervention ; acceptation API antérieure ne suffit pas à l'affirmer.
- La politique watchdog retient encore tout heartbeat en cas de couverture partielle d'un calendrier tournant ; une éventuelle politique de fraîcheur sur rotation complète demande des tests dédiés.
- Aucun achat, réservation, service payant, nouvelle automatisation ChatGPT ou fusion vers main.
- L'onglet Healthchecks créé pour cette intervention est fermé ; l'onglet Apps Script d'origine est conservé.

La mise en service autonome reste NO-GO jusqu'aux contrôles restants.
