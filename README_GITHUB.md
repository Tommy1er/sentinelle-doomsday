# Sentinelle Doomsday — Édition GitHub Actions

Option gratuite **sans Oracle, sans VPS et sans planification ChatGPT**. Le robot utilise Playwright Chromium avec une vérification programmée toutes les 5 minutes, mais GitHub peut retarder ou omettre des exécutions : **ce n'est pas un service temps réel ni une garantie de détection en 5 minutes**.

## Pourquoi GitHub plutôt que Google Apps Script ?

Pathé peut charger ses séances dynamiquement via JavaScript. Le robot existant utilise un véritable navigateur Chromium ; GitHub Actions permet d'exécuter ce code sans le réécrire et sans ouvrir ton PC. Un Apps Script seul ne peut pas rendre les pages JavaScript comme Playwright.

## Installation (à réaliser avec Work ou dans GitHub)

1. Créer un **nouveau dépôt GitHub public dédié** à `sentinelle-doomsday`. Ne pas mélanger avec Odyssée, BRVM Bulldozer ou les dépôts professionnels. Le dépôt public donne accès gratuitement aux runners GitHub standards. Dans un dépôt privé, les minutes des runners GitHub sont soumises au quota mensuel et peuvent coûter de l'argent.
2. Y déposer tous les fichiers de ce dossier, y compris `.github/workflows/sentinelle.yml` et `github_state.py` ; ne jamais inclure un vrai fichier `.env`.
3. Activer **Settings → General → Features → Issues**. Le programme conserve son état dans un issue nommé `[Sentinel state] Avengers Doomsday — machine managed`. **Le contenu de cet issue sera public** : il comprend uniquement des textes et états de la page Pathé, sans identifiants Gmail ni Telegram.
4. Dans **Settings → Secrets and variables → Actions**, créer cinq secrets chiffrés : `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_TO`. Le mot de passe Gmail doit être un **mot de passe d'application** d'une boîte d'envoi dédiée, jamais le mot de passe du compte principal. Ne pas partager les secrets avec ChatGPT, Work ou dans une capture d'écran.
5. Dans **Actions → Sentinelle Doomsday (Pathé) → Run workflow**, lancer le premier contrôle manuel. Vérifier les logs, l'existence de l'issue et la ligne `statut=...`. Le premier contrôle crée la ligne de base et n'alerte pas si rien n'a changé.
6. Avant de faire confiance au robot, lancer manuellement **Actions → Run workflow** en cochant `send_test_alerts`. Le test est marqué « TEST », puis le contrôle réel s’exécute. Confirmer la réception sur Telegram **et** Gmail.
7. Activer les notifications GitHub pour les échecs du workflow ; examiner les runs régulièrement. Le système ne peut pas s'auto-alerter si GitHub ne déclenche pas le workflow du tout.

## Fonctionnement de l'état

Les runners GitHub sont temporaires : un fichier `data/last_state.json` sur un runner disparaît à la fin de chaque run. `github_state.py pull` récupère donc cet état depuis l'issue. Après chaque vérification, `github_state.py push` l'enregistre à nouveau. Les secrets ne sont jamais sauvegardés dans l'issue.

## Sécurité

- Dépôt public mais **aucun secret dans le code**, seulement dans `Actions secrets`.
- Ne pas ajouter de déclenchement `pull_request` pour des contributions externes.
- Ne pas stocker de token, email personnel, numéro de téléphone, historique bancaire ou données privées dans le JSON d'état.
- GitHub Actions a des règles d'utilisation et peut ralentir, suspendre ou désactiver les actions planifiées dans certaines conditions. Les sites peuvent bloquer les robots ; respecter leurs conditions d'utilisation, ne pas contourner les CAPTCHA.

## Contrôle de qualité

- `python -m unittest discover -s tests -v` valide la logique de détection et les notifications sans aucun appel au site.
- Vérifier une première exécution réelle contre la page Pathé avant de considérer la surveillance opérationnelle.
- La billetterie n'est **pas ouverte** du seul fait qu'un texte a changé. Le robot envoie un signal et un lien ; l'achat reste manuel.
- Désactiver le workflow après la période de sortie du film.
# Vérifications avant activation

La planification reste en pause tant que la variable de dépôt
`SENTINEL_ENABLED` ne vaut pas `true`. Les tests manuels restent disponibles.
N'activer cette variable qu'après avoir configuré les cinq secrets et validé
la réception des deux notifications.

Le workflow propose `dry_run: true` pour vérifier l'accès à Pathé depuis GitHub
sans utiliser les secrets ni modifier l'état. Exécuter ce mode avant d'activer
les alertes. Avec `send_test_alerts: true`, un échec d'envoi entraîne désormais
l'échec du workflow même si le contrôle Pathé réussit ensuite.

La surveillance s'arrête après le 21 décembre 2026 UTC : les contrôles et les
notifications sont ignorés après cette date. Le calendrier est limité aux mois
de novembre et décembre ; désactiver ensuite le workflow dans GitHub Actions.

