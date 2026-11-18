# Sentinelle Doomsday — benchmark réel et décision de quota, 18 novembre 2026

Statut : **source disponible et CI validée ; mesures Apps Script 8/20 dates non exécutées**. Surveillance permanente et Healthchecks encore désactivés. Aucun déclencheur créé.

## Faits établis

- Pilote précédent : 288 exécutions **automatiques**, durée Google totale **64 min 57 s** (en moyenne **13,53 s** par déclenchement), 8 dates surveillées par cycle.
- Mesures internes : 289 cycles incluant le lancement manuel, 288 sains, 54 min 55,689 s au total ; ce temps interne n'est pas la consommation du quota des déclencheurs.
- Journal Apps Script : 101 min 39 s d'autres exécutions mais le tableau `My Executions` inclut aussi des projets dont l'utilisateur est propriétaire, éditeur ou lecteur. Un total brut de ce journal **n'établit pas** le budget consommé sous l'identité propriétaire du déclencheur Sentinelle.
- Quota officiel consumer : **90 minutes de temps de déclencheurs par utilisateur par période de quota**, remises à zéro 24 heures après la première requête. Il ne s'agit pas d'une limite propre à un projet. Référence : https://developers.google.com/apps-script/guides/services/quotas.
- `fetchAll` a été introduit et testé en CI ; **les gains de temps réels restent non mesurés**.

## Instrument de mesure publié

`tools/google_apps_script_quota_benchmark.gs`

Fonctions à lancer **manuellement** dans le projet privé existant, sans aucun déclencheur :

- `sentinelleBenchmark8Once()` : GET du calendrier `/cinemas` puis 8 dates d'ancrage (un `fetchAll`).
- `sentinelleBenchmark20Once()` : même calendrier puis les 8 dates d'ancrage + 12 dates supplémentaires (lots `8+8+4`).

Ces fonctions n'utilisent **pas** `PropertiesService`, `LockService`, `MailApp`, Telegram ou Healthchecks ; elles ne modifient ni l'état de réservation, ni la file de notifications, ni les déclencheurs. Elles réutilisent les mêmes constructeurs de requêtes et le même classificateur JSON que le moteur PR #4.

**Limite majeure :** les dates de sortie non programmées peuvent renvoyer des tableaux `[]`, plus rapides à traiter que des séances réellement ouvertes. Le test compare le réseau et le parsing actuels, pas une charge future garantie. Il exclut également la persistance et les notifications de la boucle complète.

## Protocole de vérification dans Work

1. Vérifier le code source sur GitHub et que PR #4 n'a pas été fusionnée. Dans le projet Apps Script privé, installer `QuotaBenchmark.gs` en copiant uniquement le fichier de benchmark **après** avoir confirmé que les helpers `Sentinel.gs` et `BookingIntegration.gs` sont à jour sur le correctif de PR #4.
2. Exécuter `sentinelleBenchmark8Once()` puis `sentinelleBenchmark20Once()` manuellement. Refaire idéalement **5 observations de chaque format** à des instants différents, sans déclencher de réservation ou de notification.
3. Consigner pour chaque appel : `totalMs`, `coreMs`, les `batches[].elapsedMs`, les compteurs `validDetailedDays`, `unknownDetailedDays`, `failedDetailedDays`, le nombre de séances parsées et les codes HTTP.
4. Un lot qui échoue en entier n'est **pas** un succès de performance : `failedDetailedDays>0`, `unknownDetailedDays>0` ou `coreHttpStatus!==200` impliquent NO-GO pour la validation du cycle testé.
5. Comparer aux durées **Google de l'exécution**, pas uniquement à `totalMs`. Noter que ce benchmark n'inclut pas les propriétés et les canaux ; ajouter une marge de sécurité avant de projeter l'exploitation continue.
6. Examiner le tableau `My Executions` pour les autres projets, sans additionner indistinctement des exécutions appartenant à des collaborateurs. La documentation avertit que le tableau inclut les projets visibles, pas seulement les exécutions imputables au quota du propriétaire : https://developers.google.com/apps-script/guides/dashboard. Si le périmètre ne peut être établi, garder explicitement cette incertitude.

## Seuils de budget

À 288 déclenchements par 24 h :

- `90 min / 288 = 18,75 s` : durée moyenne **maximale purement théorique** sans aucun autre déclencheur ni marge.
- `60 min / 288 = 12,50 s` : cible de travail prudente pour réserver **au moins 30 minutes** à d'autres déclencheurs et à la variance. Ce n'est pas une garantie du solde réel.
- Le pilote à `64 min 57 s / 288 = 13,53 s` par déclenchement dépasse déjà cette cible de 12,50 s, même si la limite absolue de 90 min n'a pas été atteinte par la seule Sentinelle.

Si les résultats de la version parallèle sont trop lents ou si d'autres projets consomment une part significative du quota, envisager une exécution sous **un compte dédié autorisé** (quota distinct de l'identité d'exécution), ou revoir la couverture/cadence avec un dispositif de secours. Une telle migration n'est **pas** réalisée par ce protocole.

## Critère GO

Aucune activation permanente avant :

1. Observations réelles satisfaisantes et sans erreur du moteur **corrigé**, à 8 ET à 20 dates.
2. Inventaire crédible du budget de déclencheurs imputable à l'identité qui exécutera Sentinelle (ou compte isolé).
3. Tests de santé/erreurs et canaux maintenus, watchdog indépendant activé sur une configuration de production distincte du pilote expiré.
4. Validation distincte d'une vraie séance IMAX Laser et, ultérieurement, d'un passage réel à « billets achetables ».

**Important :** ne pas pointer un nouveau déclencheur sur `sentinelleInstrumentedPilotCycle` : sa fenêtre de 24 h est expirée. Aucun nouveau pilote ni surveillance permanente n'est lancé ici.
