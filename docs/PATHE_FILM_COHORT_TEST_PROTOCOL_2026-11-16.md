# Pathé Maroc — protocole de tests comparatifs multi-films

Date de préparation : 16 novembre 2026. **Le test live ci-dessous n'a pas encore été exécuté**. Ce document donne une méthode reproductible sans paiement, connexion client, tentative de contournement ou surveillance récurrente.

## Pourquoi ce test

Notre moteur surveille actuellement les jours, versions et tags de `/api/show/avengers-doomsday-55389/cinemas`. Ce flux peut changer dès l'ajout des séances, mais **il n'est pas démontré qu'il change lorsque la vente des places devient réellement possible**. Des pages HTML peuvent aussi contenir les mots `shows`, `showtimes` et « aucune séance » sans décrire la programmation du film courant.

Il faut donc comparer des **films dans des états différents**, identifier les véritables endpoints de séances et liens d'achat et mesurer ce qui change dans chaque transition.

## Groupe de contrôle — fiches réelles

| Film | URL | État **déjà établi** au 16/11 | Rôle |
|---|---|---|---|
| Avengers: Doomsday | https://www.pathe.ma/fr/films/avengers-doomsday-55389 | API /cinemas : HTTP 200, `{}` ; aucune date constatée | Contrôle négatif ciblé |
| Comment braquer une banque | https://www.pathe.ma/fr/films/comment-braquer-une-banque-56359 | API /cinemas : HTTP 200, deux dates à Californie ; Chrome : horaires 17h30 VF / 22h30 VOSTFR le 16 novembre | Contrôle positif de PROGRAMMATION, **réservation effective non encore certifiée** |
| Aya et Hadi | https://www.pathe.ma/fr/films/aya-et-hadi-56377 | URL observée sur Pathé ; **état de programmation non vérifié** | Candidat à classer lors de la première sonde |
| Scrooge / Ebenezer | https://www.pathe.ma/fr/films/scrooge-ebenezer-54897 | URL observée sur Pathé ; **état de programmation non vérifié** | Candidat à classer lors de la première sonde |

**À ajouter après inspection Chrome :** un film dont on peut effectivement atteindre l'écran de sélection des places, de préférence un titre en IMAX au Pathé Californie. Sans ce contrôle positif, le test ne peut pas valider la transition « séance programmée » → « billets effectivement achetables ».

## Test Google Apps Script (manuel, ponctuel)

1. Ajouter le fichier `tools/google_apps_script_film_cohort_audit.gs` au projet privé **Pathe-Connectivity-Smoke** (en conservant les autres fonctions).
2. Exécuter `testPatheCohortAuditFixture()` ; doit produire `PASS 9 Pathé cohort auditing fixtures`. Cela ne requiert pas d'accès réseau.
3. Exécuter **une fois** `auditPatheFilmCohort()`. Il réalise jusqu'à huit lectures publiques : fiche et API cinéma de quatre films, espacées par 800 ms.
4. Examiner les résultats : codes HTTP, dates et versions à `cinema-pathe-californie`, tags, noms de champs par jour, indicateurs booléens éventuels, URLs d'API observées dans le cache Angular `ng-state`. Le rapport n'exporte ni corps HTML, ni valeurs de query, ni identifiants de compte.
5. Classer chacun des deux films candidats **uniquement après** le test ; ne pas supposer qu'ils sont « à venir » ou « ouverts ».
6. Consigner le rapport JSON horodaté dans une note technique en occultant toute information privée si un nouvel endpoint apparaît.

### Comparaison dans Chrome du film réellement réservable

Utiliser le navigateur normal connecté **sans passer au paiement** : ouvrir la fiche du film témoin et sélectionner une vraie séance Pathé Californie jusqu'à constater si la page propose le choix des sièges. Observer les seules **requêtes publiques** du réseau qui renvoient les horaires, le format, les statuts de vente et le lien de réservation.

Noter pour chaque réponse : chemin de l'API (sans paramètres sensibles), champs de date/heure, fuseau, identifiant de séance, cinéma, type de projection, booléens `bookable` éventuels, URL du parcours de réservation et délai de rafraîchissement.

**Ne pas confondre :**
- Film publié sur le site ;
- Film programmé pour un jour ;
- Séance possédant un horaire ;
- Séance vendable (transition commerciale) ;
- Place dans un emplacement donné effectivement libre.

La présence de dates ne suffit jamais à conclure aux trois derniers états. Les boutons non présents dans l'HTML initial peuvent être ajoutés par JavaScript : il faut regarder la vraie requête réseau du navigateur.

## Tests de transitions indispensables

| Transition | Source de vérité à établir | Résultat attendu |
|---|---|---|
| Pas de date → première date Californie | API du film ciblé /cinemas | Alerte « programmation détectée » |
| Date déjà présente → heure de séance ajoutée | Endpoint détaillé de séance | Alerte « horaire ajouté » |
| Horaire présent → lien de réservation commercialement actif | Endpoint/réponse d'achat approprié | Alerte « vente ouverte », **seulement après preuve** |
| Séance standard → IMAX Laser | Métadonnées des formats d'une **vraie séance Californie** | Alerte IMAX correcte, pas à partir de `DEFAULT`, `pmr` ou VIP Rabat |
| Ajout de programmation à Dar Essalam seulement | API scindée par cinéma | Pas d'alerte « Californie » |
| HTTP 403, 5xx, JSON inconnu ou cache vide | Contrôle santé de l'API | Incident, jamais faux « aucune séance » |
| Film annoncé avec compteur 24h nul mais prévente future | Endpoint de séances futures | Ne pas perdre l'événement |
| Début/fin des ventes sans changement de `days` | Endpoint de statut commercial / parcours sièges | **Test critique anti-faux négatif** |

## Après le test

- Écrire des fixtures JSON issues des **vrais schémas anonymisés**, séparées par état. Ne pas inventer des clés de réservation pour produire artificiellement un test vert.
- Pour un film en réservation, effectuer deux observations espacées permettant de détecter un changement réel ou de vérifier une stabilité normale ; ne pas réserver de place.
- Argon doit répliquer l'analyse, proposer des sources indépendantes et contester nos hypothèses.
- Les déclencheurs périodiques et notifications réelles restent désactivés durant ce diagnostic.

### Sources

Résultats constatés le 16 novembre : `docs/GOOGLE_VALUES_AND_CINEMA_API_RESULT_2026-11-16.md`.

Code de l'audit ponctuel : `tools/google_apps_script_film_cohort_audit.gs`.

PR de fiabilisation : https://github.com/Tommy1er/sentinelle-doomsday/pull/2.
