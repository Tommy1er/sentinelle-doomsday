# Plan B : Google Apps Script — test manuel de connectivité Pathé

Ce test est distinct de la sentinelle automatique. Il sert à répondre à une question précise : **les IP de Google peuvent-elles récupérer une réponse HTML identifiable de la page Pathé ?** Il n'exécute pas JavaScript du site et ne garantit donc pas l'accès aux séances.

## Exécution ponctuelle (aucun déclencheur)

1. Se connecter à https://script.google.com/ avec son compte Google.
2. Créer un projet vierge temporaire, nom : `Pathe-Connectivity-Smoke`.
3. Copier le code du fichier `tools/google_apps_script_smoke.gs` dans `Code.gs`. Ne pas coller de mot de passe, clé Telegram, cookie ou jeton.
4. Sélectionner `testPatheGoogleEgress`, cliquer sur **Exécuter** et autoriser le minimum d'accès nécessaire pour `UrlFetchApp`.
5. Ouvrir le **Journal d'exécution**. Copier uniquement l'objet JSON affiché (il ne contient ni cookies ni corps HTML).
6. Supprimer le projet temporaire si le test n'est plus utile.

## Interprétation du JSON

- `http_status: 403` : requête Google refusée — **NO-GO Google Apps Script** pour cette URL.
- `http_status: 200` et `film_name_seen: true` : le HTML reçu est identifiable, mais **NE démontre PAS** l'accès aux séances. Étape suivante : comparer les informations réelles et confirmer si des horaires figurent dans la réponse serveur.
- `http_status: 200` et `film_name_seen: false` : réponse possiblement incomplète, de challenge ou redirection. Ce n'est pas un succès.
- `error_type` non nul : panne d'exécution ou refus réseau ; diagnostiquer sans conclure à une ouverture de billetterie.
- `explicit_no_sessions: false` seul n'est jamais une preuve de mise en vente : la page pourrait être partiellement rendue en JavaScript.

## Garde-fous

- Ne pas créer de déclencheur automatique ni envoyer d'alerte tant que la lecture réelle des séances n'est pas confirmée.
- Ne pas simuler des clients, contourner de CAPTCHA ou utiliser des proxys de rotation.
- L'infrastructure Google est différente de GitHub : un résultat peut donc différer.
- Si l'accès HTTP est refusé sur tous les clouds, se rabattre sur un mécanisme officiel de notification Pathé ou une surveillance locale autorisée, avec machine active, ou demander au site une interface de consultation des séances.

## AWS — contrôle d'activation séparé

Le message `Complete your account setup` ne permet pas à lui seul de distinguer **activation incomplète** et **restriction Free plan**. Contrôler le statut du compte dans la console, la boîte mail d'activation AWS et le Support Center (catégorie Account and billing). Ne pas convertir le compte en Paid plan pour diagnostiquer cette seule erreur.
