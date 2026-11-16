# Sentinelle Doomsday — Pathé Californie, Casablanca (v1.1)

**Autonome et sans tâches récurrentes ChatGPT.** Surveillance sans achat ni réservation automatique : https://www.pathe.ma/fr/films/avengers-doomsday-55389


## Déploiement recommandé — GitHub Actions, sans serveur ni carte bancaire

**Utiliser `README_GITHUB.md` et `DEPLOIEMENT_WORK.md` pour la nouvelle version sans Oracle.** Cette édition comprend `.github/workflows/sentinelle.yml` et `github_state.py` : les runners GitHub sont temporaires, l’état est conservé dans un issue public technique, et Telegram/Gmail restent configurés dans les secrets du dépôt. Le plan gratuit dépend d’un **dépôt public dédié** et de l’utilisation de runners standards. La tâche n’est PAS encore déployée : l’activation et les tests live doivent être faits sur GitHub.

Les instructions Oracle/Docker ci-dessous sont conservées seulement comme option historique, non retenue pour ce déploiement.

## Fonctionnement
- **Rendu navigateur** avec Playwright Chromium pour observer la fiche et ses contenus dynamiques ; vérification cible environ toutes les cinq minutes sur une machine réellement disponible.
- **Détection** : texte, boutons, liens de réservation, séances, horaires et changements d'état ; filtres basiques contre les compteurs variables.
- **Deux notifications indépendantes : Telegram ET Gmail.** Même message, même lien Pathé. Une panne de l'un n'empêche pas l'autre ; une notification réussie n'est pas répétée lors d'une tentative de rattrapage de l'autre.
- **Résilience** : état et file de notifications persistants (`data/last_state.json`), journal (`data/events.jsonl`), alerte après trois puis douze échecs de chargement, notification lors de la reprise.
- **Prudence** : une modification de la fiche peut seulement indiquer une prévente *potentiellement* ouverte ; vérification manuelle du parcours de paiement. Pas de contournement de CAPTCHA. Pas de sélection ni de réservation automatique de siège.
- **Coût ChatGPT de fonctionnement : aucun** ; les éventuels frais relèvent exclusivement de l'hébergement et des services externes.

## 1. Créer les deux canaux de notification

### A. Telegram
1. Dans Telegram, contacter le compte officiel [@BotFather](https://t.me/BotFather), lancer `/newbot` et créer un bot privé.
2. Dans le nouveau bot, envoyer `/start`.
3. Récupérer son identifiant de conversation `chat_id` via l'API Telegram `getUpdates` ou le navigateur du serveur, sans publier le token. **Ne pas envoyer le token à ChatGPT ou dans un dépôt Git.**

### B. Gmail
1. Choisir une **boîte expéditrice dédiée** si possible ; elle peut envoyer les alertes à ta boîte Gmail habituelle. Ainsi, le robot n'a pas les droits d'accès à ton compte principal.
2. Si le compte choisi autorise les [mots de passe d'application Google](https://support.google.com/accounts/answer/185833), activer la validation en deux étapes puis créer un mot de passe d'application révocable et unique pour ce robot. Google recommande de préférer « Se connecter avec Google » quand c'est disponible ; l'authentification SMTP ci-dessous est une solution simple de déploiement, pas la sécurité idéale de long terme.
3. Ne **jamais** utiliser ni partager le mot de passe principal Gmail. La configuration fournie utilise **SMTP chiffré TLS** `smtp.gmail.com:465`.
4. Certaines configurations Google Workspace ou comptes avec protection avancée n'autorisent pas les mots de passe d'application. Dans ce cas, prévoir Gmail API avec OAuth ou un expéditeur transactionnel. Ce code n'implémente pas encore ce chemin alternatif.

## 2. Configurer les secrets uniquement sur le serveur

Copier `.env.example` en `.env`, puis remplir :

```ini
TELEGRAM_BOT_TOKEN=...          # Token donné par BotFather
TELEGRAM_CHAT_ID=...           # Ton chat ID Telegram
GMAIL_USER=...                 # Boîte expéditrice (idéalement dédiée)
GMAIL_APP_PASSWORD=...         # Mot de passe d'application, jamais mot de passe normal
GMAIL_TO=...                   # Ta boîte Gmail qui doit recevoir l'alerte
```

Sur Ubuntu, exécuter `chmod 600 .env`. **Ne jamais intégrer `.env` dans un ZIP partagé, envoyer les identifiants ici, ou le mettre sur GitHub.** Le fichier `.gitignore` l'exclut.

## 3. Déployer sur une instance Ubuntu / Oracle Cloud

Prérequis : instance Oracle Cloud réellement provisionnée, Docker Engine et plugin Docker Compose, connexion Internet sortante vers Pathé/Telegram/Gmail ; Oracle Always Free dépend de l'éligibilité et des ressources disponibles.

1. Transférer ce dossier vers `/opt/sentinelle-doomsday` ; créer `data/` dans ce répertoire.
2. Configurer `.env` sur le serveur comme décrit ci-dessus.
3. Depuis `/opt/sentinelle-doomsday` :

```bash
sudo docker compose build
sudo docker compose run --rm sentinelle --dry-run
sudo docker compose run --rm sentinelle --test-alert
sudo docker compose run --rm sentinelle
```

Le test envoie un message explicite « TEST » aux **deux canaux**. Vérifier les deux réceptions *avant* de démarrer le timer. Si l'un échoue, la notification reste en attente pour la prochaine tentative et ne doit pas être confondue avec un test réussi.

4. Vérifier les autorisations du répertoire partagé `data/` ; puis installer le service et le timer :

```bash
sudo cp sentinelle-doomsday.service sentinelle-doomsday.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sentinelle-doomsday.timer
systemctl list-timers sentinelle-doomsday.timer
journalctl -u sentinelle-doomsday.service -n 100 --no-pager
```

`OnUnitInactiveSec=5min` correspond à cinq minutes **après la fin du contrôle précédent**, pas à un intervalle strict garanti de cinq minutes. `RandomizedDelaySec=10s` ajoute un décalage. La surveillance doit rester raisonnable et respecter les conditions de Pathé.

## 4. Supervision et arrêt

La file d'attente des notifications est persistante ; en cas d'échec Gmail après succès Telegram, seul Gmail est retenté. Le journal des événements distingue « notification Telegram envoyée », « Gmail envoyé », « fichier inaccessible », etc.

```bash
sudo systemctl status sentinelle-doomsday.timer
sudo journalctl -u sentinelle-doomsday.service --since today --no-pager
sudo systemctl disable --now sentinelle-doomsday.timer
```

**Important** : la supervision d'un serveur totalement arrêté exige un second service externe. Un timer local ne peut pas envoyer d'alerte si le VPS lui-même est éteint. La fiche officielle peut également déplacer le parcours d'achat vers un système tiers, d'où la nécessité de tester le site réel après installation.

## 5. Tests locaux (sans envoi)

```bash
python -m pip install -r requirements.txt
python -m playwright install chromium
python -m unittest discover -s tests -v
python sentinel.py --dry-run
```

## État actuel

- Code : prêt à configurer ; tests unitaires possibles sans secrets.
- **Non déployé** sur Oracle Cloud ; **aucun test de réception Telegram/Gmail n'a encore été effectué**.
- Le site Pathé n'affiche toujours pas de séance au moment du contrôle de référence du 16 novembre 2026.
