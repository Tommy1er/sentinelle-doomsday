# Audit expert indépendant — Sentinelle Doomsday (20 novembre 2026)

Base auditée : PR #5 `claude/fail-open-20261120` (f52a559), empilée sur les PR #4 → #3 → #2 → #1.
Correctifs : branche `claude/expert-audit-20261120` (cette PR).

## 1. Constat d'ensemble

| Point | Constat vérifié |
| --- | --- |
| Surveillance active | **Aucune.** Production `DISABLED`, aucun déclencheur, Healthchecks en pause (dernier rapport Apps Script). |
| Chaîne de PR | Cinq PR ouvertes et empilées. `main` ne contient pas le moteur Apps Script. La note de passation ignore la PR #5. |
| Tests | 12 suites JS + 20 tests Python au vert avant correctifs ; 13 suites au vert après. |
| Accès Pathé | Le CDN Pathé renvoie HTTP 403 depuis les IP cloud (GitHub, et ce conteneur d'audit). Seule l'infrastructure Google a été démontrée fonctionnelle. Aucune vérification en direct n'a donc été possible pendant cet audit. |
| Schéma réel connu | Une seule capture réelle (`tests/fixtures`, 16 nov.). Seul `status: "available"` a été observé ; tout autre statut est inconnu. |

## 2. Défauts trouvés et corrigés

| # | Criticité | Défaut | Preuve | Correction |
| --- | --- | --- | --- | --- |
| D1 | **Critique** | À l'ouverture réelle (fenêtre de vente commencée, `status: available`), si le lien de réservation n'est pas reconnu (autre sous-domaine, chemin relatif, champ vide), l'utilisateur recevait « 📅 Ventes : pas encore ouvertes », avec une heure d'ouverture **déjà passée**, et aucun rappel. C'est précisément l'alerte ratée que la PR #5 dit éliminer. | Reproduit sur la PR #5 ; test de non-régression `opening with an unrecognised Pathé host…` | Nouvel état `salesState` (OPEN / NOT_YET / ENDED / **UNCERTAIN**). Toute séance UNCERTAIN déclenche « ⚠️ vente peut-être ouverte : vérifie MAINTENANT » avec rappels Telegram. |
| D2 | Haute | Une séance publiée en prévente (sans lien) qui reste sans lien reconnu à l'heure d'ouverture ne produisait **aucune** nouvelle alerte : l'instantané ne retenait pas l'état. | Test `presale session whose start passes…` | L'instantané stocke l'état (`st`). Le passage à UNCERTAIN alerte une seule fois. |
| D3 | Haute | Avec plus de 20 dates programmées, la rotation empêchait **définitivement** le heartbeat. Healthchecks serait alors resté « DOWN » pendant des semaines, et une alarme toujours rouge finit ignorée, au moment même où elle compte. | `sentinelleHealthyForWatchdog_` | Âge du dernier contrôle sain enregistré **par date**. En rotation, le heartbeat n'est envoyé que si **toutes** les dates ont été lues sans erreur depuis moins de 30 min. Chaque cycle publie `oldestDateCheckAgeMinutes` et `staleDates`. Les erreurs de lecture, de cœur et de livraison bloquent toujours. *(Révisé après la revue de la PR #6.)* |
| D4 | Moyenne | Sur Telegram, seul le corps était envoyé. L'alerte « Programmation détectée » s'affichait sur le téléphone comme « Cinéma : Pathé Californie… », sans dire ce qui s'était passé. Même chose pour « Surveillance en échec ». | `sentinelleFlushOutbox_` | Le titre est ajouté en tête quand le corps n'en a pas. |
| D5 | Moyenne | File saturée (4 messages, canaux en panne) : le message le plus récent était écrasé, même si c'était l'alerte 🚨 d'ouverture et que le nouveau message n'était qu'un avis de couverture. | `sentinelleEnqueue_` | Un message de routine n'écrase jamais une alerte critique ; en cas de compactage, l'alerte critique est conservée. |
| D6 | Moyenne (IMAX) | `auditoriumName` et `auditoriumCapacity` existent dans l'API mais étaient ignorés. Ce sont les meilleurs indices disponibles pour repérer la salle IMAX. | Fixture réelle | Salle et capacité affichées dans chaque alerte. Une salle dont le nom contient « IMAX » est marquée 🎯, même sans tag. Le Laser reste à confirmer sur la page de réservation. |
| D7 | Faible | Pas d'arrêt automatique (P2). | — | Propriété optionnelle `DOOMSDAY_PRODUCTION_UNTIL`. Après cette date, une clôture **par phases idempotentes** a lieu. Le message 🛑 est créé une seule fois, mais sa livraison est réessayée à chaque cycle. La pause de Healthchecks (si `HC_API_KEY` est fournie) est elle aussi réessayée. Le déclencheur n'est supprimé qu'une fois le message livré sur les deux canaux, ou au plus tard 24 h après le début de la clôture. Tant que ce n'est pas fini, l'état `CLOSEOUT_INCOMPLETE` (avec sa raison) apparaît dans le rapport. Ensuite, plus rien ne s'exécute. Reprise manuelle : lancer `sentinelleProductionTick()` depuis l'éditeur. *(Révisé après les deux revues de la PR #6.)* |
| D8 | P0 (preuves) | Impossible de prouver depuis GitHub l'identité d'exécution, la version installée et le déclencheur actif. | — | `sentinelleDeploymentReport()` (lecture seule), révisé après la revue de la PR #6 : (a) **empreinte SHA-256** du code de toutes les fonctions et configurations des 7 fichiers, comparée à la valeur que la CI calcule depuis le commit (les retours à la ligne CRLF et les espaces en fin de ligne sont tolérés) ; (b) chaque exécution **automatique** enregistre l'identité réelle et le `triggerUid`, que le rapport confronte aux déclencheurs du compte. Un déclencheur d'un autre compte, une autre identité, un autre code ou une exécution trop ancienne apparaissent dans `problems`. Verdict `LIVE_VERIFIED` seulement avec ces preuves. |

## 3. Risques résiduels (non corrigés, assumés)

- **Statuts Pathé inconnus.** Un statut différent de `available` pendant la fenêtre de vente produit désormais l'alerte « vérifie MAINTENANT » ; c'est volontaire, au prix de fausses alertes possibles.
- **Un seul compte Google = un seul point de panne.** Healthchecks le signale, mais seulement 15 minutes plus tard. Une seconde instance sur un autre compte, décalée de 2 à 3 minutes, reste recommandée.
- **Quota.** Le pilote a consommé 65 min/jour, avec le moteur non optimisé (≈ 13,5 s par cycle). Le moteur optimisé a mesuré 4,1 s en contrôle manuel, ce qui donne une estimation de **25 à 30 min/jour, non démontrée**. Le rapport affiche `measuredWrapperRuntimeMinutes` (chronomètre interne) et `estimatedGoogleBilledMinutes` (même chiffre plus environ 2,09 s de surcoût Google par exécution, calibré sur le pilote : 3 897 s facturées contre 3 296 s mesurées sur 288 exécutions). **Ces deux chiffres ne prouvent rien sur le quota.** La seule mesure qui fait foi est le temps des exécutions de type « Déclencheur » affiché par Google (Apps Script, page « Exécutions »), en additionnant **tous les projets du compte**. Apps Script n'expose pas le quota restant.
- **Rappels Telegram.** `getUpdates` sans `offset` lit les 100 plus anciennes mises à jour non confirmées. Sans effet en usage normal. Un webhook configuré sur le bot désactiverait la lecture des accusés ; les rappels continueraient alors jusqu'à 12.
- **IMAX Laser.** Toujours non certifié : aucune séance témoin. L'alerte indique la salle ; la confirmation se fait à l'œil sur la page Pathé.
- **Limite de preuve.** L'empreinte couvre le code des fonctions et les objets de configuration, pas les commentaires. `ScriptApp.getProjectTriggers()` ne voit que les déclencheurs du compte qui lance le rapport. Un déclencheur d'un autre compte n'apparaît donc que s'il s'exécute (`AUTOMATIC_RUN_FROM_A_TRIGGER_NOT_OWNED_BY_THIS_ACCOUNT`), ou dans la page « Déclencheurs » de cet autre compte.
- **Fuseau.** L'affichage « heure de Casablanca » suppose UTC+1, ce qui est correct en décembre 2026.

## 4. Décision

**NO-GO tant que la checklist de mise en service n'est pas exécutée. GO technique dès qu'elle l'est.**

Le code est prêt. Les seuls blocages restants sont des actions dans des comptes privés (Apps Script, Healthchecks, Telegram), auxquels l'auditeur n'a pas accès. Attendre n'apporte plus aucune sécurité : les préventes sont ouvertes en France et rien ne surveille le Maroc.

Critères vérifiables du GO, tous issus de `sentinelleDeploymentReport()` et des journaux :

1. `verdict = "LIVE_VERIFIED"`, `problems = []`, `codeFingerprintInstalled` = empreinte affichée par la CI pour le commit déployé, `lastAutomaticRun.identity` = compte retenu, `lastAutomaticRun.watchdog = "ACKNOWLEDGED"`.
2. Le journal « Exécutions » montre ce même cycle déclenché par un déclencheur temporel (et non par l'éditeur).
3. Healthchecks passe à « UP ». Une panne simulée (mettre `DOOMSDAY_PRODUCTION_ENABLED=false` pendant 20 min) provoque l'alerte DOWN sur Telegram **et** e-mail, puis le retour UP après réactivation.
4. Après 24 h : `last24h.cycles ≥ 280`, et le temps **mesuré par Google** pour les exécutions par déclencheur de tous les projets du compte reste sous 60 min, ce qui laisse 30 min de marge sur les 90. L'estimation du rapport sert seulement d'indicateur d'alerte entre deux vérifications.

Voir `docs/MISE_EN_SERVICE_2026-11-20.md` pour la procédure.
