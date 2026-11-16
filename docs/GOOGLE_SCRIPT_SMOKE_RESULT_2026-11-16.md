# Diagnostic Google Apps Script — 16 novembre 2026

Projet Google : Pathe-Connectivity-Smoke. Fonction : testPatheGoogleEgress, provenant de tools/google_apps_script_smoke.gs sur feat/aws-pathe-preflight.

Deux exécutions manuelles réelles, sans déclencheur et sans notifications :

| Contrôle UTC | HTTP | Taille du HTML | Film présent | Message aucune séance | Erreur |
|---|---:|---:|---|---|---|
| 2026-11-16T14:57:09.317Z | 200 | 274619 caractères | oui | oui | aucune |
| 2026-11-16T14:57:27.876Z | 200 | 274660 caractères | oui | oui | aucune |

## Conclusion bornée

La réponse HTML de la page officielle est accessible depuis UrlFetchApp sur ces deux contrôles. Le message d'absence de séances est présent dans ce HTML. Il n'est donc pas nécessaire d'exécuter Chromium pour récupérer ces éléments précis dans l'état actuel de la page.

Cela ne prouve pas encore qu'une future séance, son format IMAX et son lien de réservation seront présents dans la réponse HTML serveur. La présence d'une chaîne dans le HTML pourrait également provenir d'un modèle de page : vérifier les données structurées réellement utilisées et une fixture d'ouverture avant activation.

La différence de taille entre les deux réponses montre qu'un hash du HTML entier ne convient pas pour des alertes fiables. Extraire uniquement les données de séances ou les éléments sémantiques pertinents.

Aucun secret Telegram/Gmail configuré, aucun test de réception, aucun déclencheur automatique créé. La surveillance GitHub demeure en pause.

AWS : aucune requête Pathé exécutée depuis AWS ; CloudShell a renvoyé une impossibilité de créer l'environnement puis l'écran Complete your account setup, qui évoque une inscription incomplète ou une restriction de plan gratuit. La cause exacte n'est pas établie. Aucun passage au plan payant.
