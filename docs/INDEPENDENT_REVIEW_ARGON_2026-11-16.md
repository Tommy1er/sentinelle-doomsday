# AUDIT EXIGEANT — Sentinelle Doomsday

Date : 2026-11-16. Cette note est une demande de contre-expertise indépendante pour Argon (Gemini) et tout autre relecteur. Elle décrit l'état du dépôt à cette date, sans inférer de disponibilité réelle non vérifiée.

## Source et objectif

- Film : https://www.pathe.ma/fr/films/avengers-doomsday-55389
- Cinéma prioritaire : Pathé Californie, Casablanca, avec préférence IMAX Laser.
- API de programmation validée depuis Google Apps Script : https://www.pathe.ma/api/show/avengers-doomsday-55389/cinemas
- Au 16 novembre, Doomsday répond HTTP 200 avec `{}` ; film témoin `comment-braquer-une-banque-56359` montre les dates, versions et tags par cinéma.
- Les tentatives Playwright sur GitHub et HTTP simple depuis AWS ont reçu HTTP 403. Aucun contournement d'antibot n'est autorisé.
- L'objectif opérationnel est un avertissement suffisamment tôt pour réserver soi-même des sièges au centre de la dernière rangée ; aucun achat ni paiement automatisé.

## Ce qui est prouvé par tests

- HTML + API officielle accessibles par Google UrlFetchApp, avec source documentée dans `docs/GOOGLE_VALUES_AND_CINEMA_API_RESULT_2026-11-16.md`.
- Détecteur sur `cinema-pathe-californie.days`, sans se fier au texte « aucune séance », aux tableaux `shows` génériques ni à des tags VIP d'un autre cinéma.
- Tests d'API vide, autre cinéma, apparition, disparition, versions réordonnées, alertes en attente, panne HTTP, réessai par canal.
- PR d'audit `audit/sentinel-reliability-v1` : les réponses JSON incohérentes échouent sans être classées « rien à signaler » ; deux lectures vides requises avant de supprimer des dates précédemment observées ; la file d'alertes a un plafond explicite pour respecter les limites de Script Properties.

## POINTS BLOQUANTS P0 — ne PAS activer avant preuve

1. **Disponibilité réelle** : l'endpoint `/cinemas` peut rester identique quand des séances deviennent achetables. Découvrir via film témoin les endpoints officiels qui fournissent horaires, format IMAX Laser, identifiant de séance, URL de réservation, état de vente ; tester les transitions `non programmé -> programmé -> ventes ouvertes`. Ne pas qualifier une URL ou un bouton sans vrai contexte de séance.
2. **Canaux réels** : importer la version auditée dans le projet Google Apps Script privé ; configurer les propriétés secrètes dans l'interface, pas dans GitHub ; recevoir un message Telegram TEST et un Gmail TEST. Vérifier la réception et les horodatages, pas uniquement le statut de la fonction d'envoi.
3. **Jeton Telegram** : un jeton du nouveau bot a été partagé dans une capture utilisateur. Il doit être révoqué/remplacé via BotFather avant toute mise en production ; ne jamais l'insérer dans des tickets, commentaires GitHub, logs ou captures publics.
4. **Heartbeat indépendant** : le script ne peut pas signaler sa propre absence d'exécution. Concevoir une sentinelle externe (ping vers un service de surveillance de jobs, ou mécanisme équivalent), avec alerte en cas d'absence de contrôle réussi >15–20 minutes et preuve qu'elle fonctionne quand Apps Script ne s'exécute plus.
5. **Récurrence réelle** : une période d'observation de 24 h avec mesure des durées, des statuts HTTP, des écarts entre exécutions, des quotas MailApp et de l'absence de faux doublons. Google everyMinutes(5) n'est pas une garantie temps réel.

## CONTROLES P1 — scénarios adversariaux

- Une réponse `200` avec `{error: 'maintenance'}` ou `cinema-pathe-californie: null` ne doit jamais produire `NO_PROGRAMME_FOR_CINEMA`.
- La réponse `{}` reste un état valide pour Doomsday. Une unique réponse vide après des dates connues ne doit pas déclencher une alerte trompeuse de disparition.
- Les dates changent d'ordre, tags changent d'ordre, ou un autre cinéma ouvre : pas de nouvelle fausse alerte Californie.
- Alertes en panne : Telegram marche/Gmail échoue et inversement ; aucune perte silencieuse de l'événement le plus récent ; stockage <9 Ko par propriété.
- Nouvelle programmation apparue pendant une panne : elle est conservée puis livrée après rétablissement, sans effacer la dernière alerte importante.
- Les données API se chargent, mais la liste détaillée de séances disparaît ou demeure en cache : signaler la perte de couverture de la **billetterie**, pas un état vide.
- Les tags IMAX doivent être établis à partir d'un vrai programme Pathé Californie et des métadonnées, jamais supposés égaux à `PREMIUM`, `DEFAULT`, `vip_fr` ou `pmr`.
- Scénarios de sortie : VOSTFR/VF, séance déplacée/annulée, disponibilité du siège dernier rang, date de début des ventes dans le futur, heure d'été et fuseau Africa/Casablanca.
- Ne jamais stocker les identifiants de bot, email utilisateur, cookies ou liens comportant jeton dans le dépôt public.
- Stratégie d'arrêt après la sortie ; aucune tâche ChatGPT planifiée.

## Limites financières et service à instrumenter

- Déclencheur de 5 minutes : environ 288 exécutions / 24 heures ; le quota Apps Script personnel de 90 minutes de durée totale des déclencheurs implique une moyenne <18,75 secondes par exécution si tout le quota était réservé à ce seul script.
- Script Properties : 9 Ko par valeur, 500 Ko pour le magasin ; surveiller la taille des files.
- MailApp personnel : 100 destinataires / jour ; suivre le quota restant. Sources officielles : https://developers.google.com/apps-script/guides/services/quotas

## QUESTIONS ATTENDUES POUR ARGON — revue hostile

1. Quels sont les scénarios réalistes où le détecteur n'enverrait aucune alerte alors qu'un billet IMAX Laser est effectivement en vente ? Fournir une reproduction et une correction testée.
2. Le schéma `/api/show/.../cinemas` peut-il être légalement réduit à `{}` quand la billetterie est disponible ? Identifier la source de vérité du paiement/horaire par séance.
3. Les fonctions Apps Script sont-elles atomiques en présence de redémarrages, exceptions, verrous, files d'attente et échec après envoi avant persistance ? Identifier les garanties possibles et celles impossibles.
4. Les limites de Google et de Telegram sont-elles surveillées ; quel est le plan de repli si un service entier tombe en panne ?
5. Proposer des tests de bout en bout et une preuve horodatée pour chaque garde-fou. Décrire explicitement les faiblesses résiduelles.

**Critère GO :** couverture des horaires + liens de réservation + IMAX validée par film témoin, deux canaux TEST confirmés, veille d'exécution indépendante, puis observation stable et revue croisée approuvée. Tant que ce n'est pas le cas, le monitoring reste désactivé et aucune mention « billetterie ouverte » n'est autorisée.