# Sentinelle Doomsday — test AWS avant toute dépense

**But :** vérifier si une sortie réseau AWS peut consulter la page officielle `https://www.pathe.ma/fr/films/avengers-doomsday-55389` sans se heurter au `HTTP 403` observé dans GitHub Actions. Ce test est *en lecture seule*. Il ne modifie ni compte Pathé ni réservation, ne contourne aucun mécanisme de sécurité et n'envoie aucune alerte.

## Ordre des opérations

1. Ouvrir la **console AWS Management** avec le compte créé et confirmer le plan **Free**, les crédits restants et une région disponible. Ne pas créer de ressources payantes tant que ce point n'est pas contrôlé. Le fait de voir une page de sélection AWS ou « no projects yet » ne démontre pas, à lui seul, que la console de gestion est pleinement active.
2. Ouvrir **CloudShell** depuis la console AWS, si ce service est accessible dans la région. CloudShell n'a pas de facturation supplémentaire pour le shell lui-même ; des tarifs peuvent s'appliquer à l'usage d'autres ressources et aux transferts de données.
3. Dans CloudShell, exécuter une fois :

   ```bash
   git clone https://github.com/Tommy1er/sentinelle-doomsday.git
   cd sentinelle-doomsday
   git fetch origin feat/aws-pathe-preflight
   git switch --detach origin/feat/aws-pathe-preflight
   python3 tools/aws_smoke.py --mode http
   ```

   `HTTP 403` = accès HTTP direct refusé. `HTTP 200` + `film_name_seen=true` = lecture brute possible. Ni l'un ni l'autre ne conclut à l'ouverture de la billetterie.
4. Si le contrôle HTTP échoue ou si l'on souhaite valider le rendu dynamique, installer Playwright dans un environnement AWS compatible, puis exécuter **une fois** :

   ```bash
   python3 -m pip install --user 'playwright==1.56.0'
   python3 -m playwright install chromium
   python3 tools/aws_smoke.py --mode browser
   ```

   Sur CloudShell, des bibliothèques système peuvent manquer : un échec de démarrage Chromium n'est **pas** une preuve que Pathé bloque AWS. Dans ce cas, tester sur une machine AWS adaptée sans toucher aux protections du site.
5. **Décision Go/No-Go :** deux exécutions indépendantes du navigateur sur AWS doivent récupérer `HTTP 200` et le nom du film dans la page. Si AWS renvoie également 403, ne pas provisionner de surveillance récurrente et ne pas tenter de contourner les protections. Prévoir une solution alternative autorisée : flux officiel de prévente, alerte fournie par Pathé, ou navigateur sur un ordinateur contrôlé avec fonctionnement accepté par le site.

## Suite après un GO

- Choisir ensuite AWS Lambda + EventBridge Scheduler (si l'image Chromium fonctionne dans la limite Lambda) ou EC2 (si un navigateur complet est indispensable), en contrôlant les coûts et les limites du compte Free.
- Utiliser une périodicité modérée (cible 5 minutes), des délais réseau, des mécanismes de backoff et un journal du dernier contrôle réussi.
- Conserver les secrets Telegram et Gmail uniquement dans le gestionnaire de secrets/variables sécurisées ; ne jamais les committer ni les coller dans les logs ou un chat.
- Activer le déclenchement seulement après les tests de non-régression du détecteur, une **vraie récupération** de la page, un test Telegram et un test Gmail. Les tests de disponibilité de billets utilisent une fixture simulée : aucun achat/placement automatique.

## Tests de diagnostic

`python3 -m unittest discover -s tests -p test_aws_smoke.py -v`

Le résultat JSON du smoke test ne contient pas d'identifiants, de corps de page ou de cookies. Il peut être communiqué à l'équipe technique. Une réponse `200` ne prouve **jamais** que la billetterie est ouverte : elle prouve seulement que le navigateur peut lire le nom du film.
