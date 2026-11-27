# Manifeste — SENTINELLE CINEMA

**Directive du porteur du projet — 27 novembre 2026**
**Statut : vision approuvée ; chantier différé. Next step final de Sentinelle Doomsday.**

## 1. Vision du propriétaire

Je souhaite capitaliser sur le travail accompli pour Doomsday afin que la prochaine surveillance de film ne nécessite plus de reconstruire toute la plomberie technique. Je veux conserver un moteur générique et une plateforme sur laquelle il suffit de désigner un film, un cinéma et les caractéristiques recherchées. Le système doit ensuite prendre en charge la surveillance et les alertes de façon autonome.

Doomsday est notre preuve de concept en conditions réelles. Le 26 novembre 2026, les premières alertes de réservation Pathé Californie ont été reçues sur les séances du 16 au 22 décembre. L'objectif prioritaire actuel reste la détection de l'ouverture IMAX, avec confirmation du format Laser lorsque les données le permettent.

## 2. Condition de lancement

Ne pas lancer la généralisation avant le dénouement de la mission IMAX Doomsday et la décision du propriétaire. Maintenir le service actuel en exploitation ; les correctifs indispensables à sa fiabilité restent autorisés selon les décisions opérationnelles existantes. Cette note ne déclenche aucune migration, aucun nouveau service, aucune dépense ni modification du code de production.

À la clôture de la mission, établir un retour d'expérience : chronologie des signaux, délais de livraison, alertes manquées ou redondantes, format réellement identifié, quota mesuré et état du déploiement. Identifier les composants à réutiliser, les défauts encore ouverts et la version effectivement déployée avant de refactoriser.

## 3. Produit cible

Une plateforme de missions de surveillance, avec une interface simple, un moteur commun et des adaptateurs par fournisseur de billetterie.

Exemple de demande future : « Surveille Avengers: Secret Wars à Pathé Californie, en IMAX Laser et VOSTFR ; préviens-moi dès que la programmation apparaît puis lorsque la réservation est ouverte. »

La configuration d'une mission comprend notamment :
- film (titre et identifiant fournisseur résolu) ;
- cinéma ou périmètre géographique ;
- formats (IMAX, IMAX Laser, 4DX, 2D, 3D, tous formats), langue/version, dates et horaires souhaités ;
- critères de déclenchement et priorités (publication, ouverture future, ouverture effective selon le signal API, anomalie) ;
- cadence, durée de surveillance, expiration et arrêt manuel ;
- canaux Telegram/Gmail, politique de rappels, accusé de lecture.

L'utilisateur crée, consulte, suspend, reprend ou clôture une mission sans écrire du code. Le tableau de bord expose état, dernière vérification, événements détectés, couverture, santé et historique des notifications.

## 4. Principes d'architecture

- **Moteur indépendant du film :** aucun identifiant, cinéma, calendrier ou titre Doomsday codé en dur dans le noyau.
- **Adaptateurs fournisseurs :** découverte des films et cinémas, programme, séances, signaux de réservation et liens officiels. Commencer par Pathé Maroc ; élargir seulement lorsque les sources autorisées sont fiables.
- **Orchestrateur partagé :** mutualiser les requêtes, le déclencheur, le stockage et les notifications. Plusieurs missions ne doivent pas créer mécaniquement plusieurs déclencheurs.
- **État et événements :** snapshots, déduplication, transitions de disponibilité, reprise après panne, idempotence, isolation entre missions.
- **Priorisation et livraison :** protéger les ouvertures recherchées dans la file d'attente ; aucun avis secondaire ne doit écraser un rappel d'ouverture critique. Accusé de lecture et reprises par canal.
- **Supervision :** Healthchecks, couverture et fraîcheur des données, santé par mission, mesure des durées effectivement imputées et quotas partagés. Cadence configurable seulement si soutenable ; cinq minutes comme référence de la mission actuelle.
- **Exactitude :** distinguer programme publié, vente annoncée, réservation proposée par l'API, format IMAX et confirmation Laser. Ne pas déduire des places disponibles ou un paiement possible du seul signal API.
- **Sécurité et usage responsable :** configuration privée des identifiants, aucun secret dans GitHub ou les journaux ; pas de contournement de restrictions, pas d'achat ou de sélection de sièges automatique. L'utilisateur garde la décision d'achat.

## 5. Feuille de route indicative

| Phase | Livrable |
|---|---|
| V1 | Extraire le moteur générique, adapter Pathé Maroc et préserver les comportements validés |
| V2 | Registre de missions, surveillance multi-films, orchestration partagée et isolation des états |
| V3 | Interface web de gestion et de supervision des missions |
| V4 | Adaptateurs pour d'autres cinémas et plateformes autorisées |
| V5 | Surveillance des catégories de places, uniquement si les données le permettent |

Au-delà du cinéma, concerts, festivals, événements sportifs et autres billetteries constituent une extension possible, hors périmètre initial.

## 6. Critères de réussite

- Lancer un nouveau film par simple configuration, sans modifier le moteur ni redéployer manuellement du code pour chaque mission.
- Détecter les transitions réelles et envoyer des alertes spécifiques au format recherché, sans perte d'une alerte critique.
- Maintenir une surveillance multi-missions fiable, mesurable et compatible avec les quotas et les sources.
- Tester les scénarios de régression, les pannes de livraison, la reprise, les doublons et la priorité IMAX avant toute migration.
- Conserver une procédure de déploiement reproductible, un diagnostic de version et un plan de retour arrière.
- Ne pas dégrader la Sentinelle Doomsday active pendant la conception.

## 7. Références du projet

- [PR #6 : moteur de production et audit](https://github.com/Tommy1er/sentinelle-doomsday/pull/6)
- [PR #7 : priorité IMAX et patchs déployés](https://github.com/Tommy1er/sentinelle-doomsday/pull/7)

Les PR empilées et les patchs réels devront être rapprochés avant la généralisation ; ce manifeste n'est pas un certificat de conformité du déploiement actuel.

**Décision du propriétaire : attendre le dénouement IMAX, puis traiter cette vision comme le chantier final de Doomsday et le point de départ de Sentinelle Cinema.**
