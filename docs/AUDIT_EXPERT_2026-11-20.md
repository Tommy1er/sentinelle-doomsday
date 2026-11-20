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
| D3 | Haute | Avec plus de 20 dates programmées, la rotation empêchait **définitivement** le heartbeat. Healthchecks serait alors resté « DOWN » pendant des semaines, et une alarme toujours rouge finit ignorée, au moment même où elle compte. | `sentinelleHealthyForWatchdog_` | La rotation (déjà signalée une fois) ne bloque plus le heartbeat. Les erreurs de lecture, de cœur et de livraison le bloquent toujours. |
| D4 | Moyenne | Sur Telegram, seul le corps était envoyé. L'alerte « Programmation détectée » s'affichait sur le téléphone comme « Cinéma : Pathé Californie… », sans dire ce qui s'était passé. Même chose pour « Surveillance en échec ». | `sentinelleFlushOutbox_` | Le titre est ajouté en tête quand le corps n'en a pas. |
| D5 | Moyenne | File saturée (4 messages, canaux en panne) : le message le plus récent était écrasé, même si c'était l'alerte 🚨 d'ouverture et que le nouveau message n'était qu'un avis de couverture. | `sentinelleEnqueue_` | Un message de routine n'écrase jamais une alerte critique ; en cas de compactage, l'alerte critique est conservée. |
| D6 | Moyenne (IMAX) | `auditoriumName` et `auditoriumCapacity` existent dans l'API mais étaient ignorés. Ce sont les meilleurs indices disponibles pour repérer la salle IMAX. | Fixture réelle | Salle et capacité affichées dans chaque alerte. Une salle dont le nom contient « IMAX » est marquée 🎯, même sans tag. Le Laser reste à confirmer sur la page de réservation. |
| D7 | Faible | Pas d'arrêt automatique (P2). | — | Propriété optionnelle `DOOMSDAY_PRODUCTION_UNTIL` : passé cette date, le cycle répond `EXPIRED`. |
| D8 | P0 (preuves) | Impossible de prouver depuis GitHub l'identité d'exécution, la version installée et le déclencheur actif. | — | `sentinelleDeploymentReport()` (lecture seule) : identité, version, fonctions présentes, déclencheurs, secrets (présence seulement), runtime 24 h, quota e-mail, verdict. |

## 3. Risques résiduels (non corrigés, assumés)

- **Statuts Pathé inconnus.** Un statut différent de `available` pendant la fenêtre de vente produit désormais l'alerte « vérifie MAINTENANT » ; c'est volontaire, au prix de fausses alertes possibles.
- **Un seul compte Google = un seul point de panne.** Healthchecks le signale, mais seulement 15 minutes plus tard. Une seconde instance sur un autre compte, décalée de 2 à 3 minutes, reste recommandée.
- **Quota.** Le pilote a consommé 65 min/jour, avec le moteur non optimisé (≈ 13,5 s par cycle). Le moteur optimisé a mesuré 4,1 s en contrôle manuel, ce qui donne une estimation de **25 à 30 min/jour, non démontrée**. Elle se mesure avec `sentinelleDeploymentReport().last24h` après 24 h. Apps Script n'expose pas le quota restant du compte.
- **Rappels Telegram.** `getUpdates` sans `offset` lit les 100 plus anciennes mises à jour non confirmées. Sans effet en usage normal. Un webhook configuré sur le bot désactiverait la lecture des accusés ; les rappels continueraient alors jusqu'à 12.
- **IMAX Laser.** Toujours non certifié : aucune séance témoin. L'alerte indique la salle ; la confirmation se fait à l'œil sur la page Pathé.
- **Fuseau.** L'affichage « heure de Casablanca » suppose UTC+1, ce qui est correct en décembre 2026.

## 4. Décision

**NO-GO tant que la checklist de mise en service n'est pas exécutée. GO technique dès qu'elle l'est.**

Le code est prêt. Les seuls blocages restants sont des actions dans des comptes privés (Apps Script, Healthchecks, Telegram), auxquels l'auditeur n'a pas accès. Attendre n'apporte plus aucune sécurité : les préventes sont ouvertes en France et rien ne surveille le Maroc.

Critères vérifiables du GO, tous issus de `sentinelleDeploymentReport()` et des journaux :

1. `verdict = "LIVE_CONFIGURATION_OK"`, `problems = []`, `executionIdentity` = compte retenu.
2. Premier cycle automatique (journal « Exécutions ») : `watchdog: "ACKNOWLEDGED"`.
3. Healthchecks passe à « UP ». Une panne simulée (mettre `DOOMSDAY_PRODUCTION_ENABLED=false` pendant 20 min) provoque l'alerte DOWN sur Telegram **et** e-mail, puis le retour UP après réactivation.
4. Après 24 h : `last24h.cycles ≥ 280` et `runtimeMinutes` sous 60.

Voir `docs/MISE_EN_SERVICE_2026-11-20.md` pour la procédure.
