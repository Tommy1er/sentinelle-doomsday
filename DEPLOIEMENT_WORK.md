# Mandat Work — Déploiement GitHub Actions (sans VPS)

L’utilisateur a demandé un robot autonome **gratuit, sans carte Oracle, sans quota ChatGPT**, surveillant la billetterie Pathé Californie pour « Avengers: Doomsday » toutes les cinq minutes environ et envoyant **Telegram ET Gmail**.

## Contraintes

- Privilégier un **nouveau dépôt public dédié**, distinct des projets Odyssée, BRVM ou professionnels. GitHub Actions standard est gratuit sur dépôt public. Ne jamais ajouter de carte bancaire ni d’option payante. Ne pas faire le déploiement dans un dépôt existant sans accord clair de l’utilisateur.
- Le code est dans le présent dossier. Préserver les fichiers Python et `.github/workflows/sentinelle.yml`. Le scheduler GitHub est opportuniste : ne pas promettre une garantie de cinq minutes.
- Ne **jamais** demander ou écrire des tokens Telegram, mots de passe Gmail, ou secrets dans le chat. Les saisir uniquement dans **GitHub → Repository settings → Secrets and variables → Actions** par l’utilisateur. Ne pas lire ou afficher les valeurs. Utiliser un compte Gmail expéditeur dédié + mot de passe d’application révocable, ou expliquer si l’accès n’existe pas.
- Pas de tâches ChatGPT, pas de contournement CAPTCHA, pas d’achat ni de réservation automatique ; priorité Pathé Californie IMAX et lien de réservation manuel.

## Étapes

1. Créer le nouveau dépôt dédié si le compte GitHub est connecté ; demander confirmation uniquement avant une opération qui pourrait être facturée ou exposer des données privées ; le dépôt contient du **code public** et un issue d’état **public** sans secrets.
2. Déposer le contenu, inclure les dossiers `.github/` et `tests/`. Vérifier que `.env` n’est pas présent.
3. Activer Issues et GitHub Actions ; vérifier permissions `issues: write` et l’absence de déclenchement `pull_request` pour contributions externes.
4. Guider l’utilisateur pour configurer les 5 secrets : `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_TO`.
5. Lancer le workflow manuellement avec l’option `send_test_alerts: true` ; contrôler le succès du job, la création de l’issue d’état et la réception du SMS? **Non : Telegram et email uniquement**. En cas d’échec, diagnostiquer sans divulguer de secrets. Rester prudent si le site Pathé bloque le navigateur hébergé.
6. Tester les contrôles ultérieurs et s’assurer que l’état est récupéré entre les runners ; surveiller les échecs et vérifier un run programmé réel.
7. Livrer l’état vérifié : dépôt, URL Actions, dernière exécution réussie, éventuels blocages, réception des deux notifications. Ne jamais déclarer « en service » avant preuves d’exécution et de réception.

Arrêt de la surveillance après la période de sortie : désactiver le workflow au plus tard le 21 décembre 2026.
