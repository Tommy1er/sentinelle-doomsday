# Audit IMAX corrigé et test Telegram — 17 novembre 2026

Heures UTC. Suite du protocole PILOT_24H_GO_NO_GO_2026-11-17.md.

## Audit réellement exécuté

Le diagnostic corrigé du dépôt (blob 7459f78fc31c28cd5f067f96be8f24075a43cc05) est installé dans ImaxAudit.gs. La première tentative d'insertion a laissé l'ancienne version ; son résultat sans champ discoveryMode a été écarté. La seconde insertion a été confirmée dans l'éditeur, puis la version corrigée a été exécutée.

À **21:28:34.522 UTC**, en **4 387 ms** :
- 31 films parcourus, sans troncature ni erreur.
- Mode fallback_detail_sample, même en l'absence de tag IMAX dans les calendriers.
- Huit couples film/date contrôlés en détail, **16 lignes de séances examinées**.
- Noms de salles observés : 1, 2, 3, 4, 4DX, 5 VIP, 7.
- Aucune séance IMAX identifiée dans cet échantillon.
- Huit autres couples de repli non inspectés ; cette recherche demeure partielle et inconclusive.
- Aucun heartbeat ni notification émis par l'audit.

Ce résultat ne remet pas en cause l'équipement IMAX Laser du cinéma et n'assimile aucune salle numérotée, VIP ou PREMIUM à IMAX.

## Test Telegram vérifiable

Ajout du module tools/google_apps_script_telegram_receipt.gs, installé dans TelegramReceipt.gs.

Un seul message explicitement marqué TEST a été envoyé à **21:30:00.211 UTC** au destinataire privé déjà configuré. Telegram l'a accepté. Le message comprend le bouton « TEST reçu sur mon téléphone ».

Le bouton porte un nonce aléatoire. Sa confirmation est acceptée seulement si nonce, message, compte émetteur et conversation privée correspondent au test en cours. Les secrets, identifiants et callbacks restent privés. La lecture getUpdates ne comporte pas d'offset pour ne pas consommer la file d'un autre lecteur.

À **21:32:43 UTC**, le statut lu était recipientAcknowledgedPhoneReceipt=false. La réception sur téléphone n'est donc pas revendiquée. Un clic ultérieur est conservé côté Telegram et pourra être vérifié en relançant sentinelleTelegramReceiptStatus(). Un clic est une déclaration du destinataire, pas une télémétrie matérielle du téléphone.

Aucun nouvel email Gmail TEST n'a été envoyé.

## Précontrôle de départ

Après rechargement, les quatre modules principaux sont non vides :
- Sentinel.gs : 19 208 caractères.
- BookingIntegration.gs : 16 037 caractères.
- Watchdog.gs : 3 460 caractères.
- PilotMetrics.gs : 4 744 caractères.

À **21:31:52.538 UTC**, un cycle instrumenté sans heartbeat a réussi en **8 100 ms** :
- Huit dates demandées et valides, couverture complète.
- Aucune date inconnue ou en échec, aucune erreur du cœur.
- Aucune séance Doomsday nouvellement réservable, aucune notification en attente.

Healthchecks a ensuite été confirmé **en pause**, période **5 minutes**, grâce **10 minutes**. La page des déclencheurs Google indique **zéro déclencheur** à la clôture. L'onglet temporaire est fermé.

## Tests et décision

[CI complète réussie](https://github.com/Tommy1er/sentinelle-doomsday/actions/runs/44180475616), commit e84291ec8ff7155bf8e50524f659b116cb76bbae. Les nouveaux tests adversariaux couvrent les confirmations périmées, un autre compte, un autre message, une conversation non privée, la persistance de l'acquittement, l'absence d'offset et la suppression des secrets dans les erreurs.

Le pilote d'infrastructure n'exige pas une séance IMAX actuellement disponible. Il reste en attente de la confirmation visible Telegram prévue par le protocole. Aucune nouvelle permission de principe n'est demandée : les autorisations précédentes restent acquises. Le clic attendu sert uniquement à établir la réception sur téléphone. Aucun pilote, tâche ChatGPT, achat, réservation, service payant ou fusion vers main n'a été créé.
