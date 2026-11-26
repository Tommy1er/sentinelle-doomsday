# Patch IMAX déployé en direct (26 novembre 2026)

Ces trois fichiers sont installés dans le projet Apps Script « Sentinelle Doomsday », après `Code.gs`, qui correspond à la PR #6. Comme ils sont chargés après lui, leurs fonctions remplacent celles de même nom dans `Code.gs`.

- `ImaxPatch.gs` : priorité IMAX. Alertes « 🎬🚨 IMAX OUVERT » et « 🎬 IMAX publié », titre calme pour les séances classiques, alerte « IMAX apparaît » dans la programmation, autotest `imaxPatchSelfTest()`.
- `ImaxPatch2.gs` : IMAX repéré même quand il est ajouté plus tard à une séance existante, alerte « vente peut-être ouverte » en IMAX, e-mails urgents mis en forme (bandeau rouge, liens cliquables), relances par e-mail à +5, +10, +15, +30, +45 et +60 min en plus de Telegram.
- `ImaxPatch3.gs` : `sentinelleSanityCheck()`, une vérification complète en lecture seule. Résultat au 26/11 à 19:55 : ok, 0 problème, 0 avertissement.

Retour en arrière : supprimer les 3 fichiers, ou mettre la propriété `DOOMSDAY_IMAX_PRIORITY=false`.
