# Notification validation — 16 November 2026

## Private Apps Script installation

The repository sentinel engine and Telegram setup helper are installed as Sentinel.gs alongside the existing diagnostic Code.gs in Pathe-Connectivity-Smoke. Telegram token and email recipient are stored in Script Properties, not in this repository. Google consent for sending mail was completed by the owner. No Gmail password or SMTP credential was used.

## Observed checks

- 15:56:56 UTC: PASS seven cinema-scoped parser fixtures.
- 16:00:11–16:00:14 UTC: Telegram discovery reached the Bot API successfully, but found zero private-chat candidates. It did not configure a guessed recipient.
- 16:00:38 UTC: one explicit TEST event was queued. Delivery summary: telegram 0, gmail 1, pending 1.
- The TEST email was independently found and read in the recipient Gmail inbox. Its body explicitly states that no ticket opening was detected.
- 16:01:14.810 UTC: first real sentinel check returned NO_PROGRAMME_FOR_CINEMA, dates 0, change false. No new Gmail notification. The pending Telegram test remained queued.
- 16:01:32.315 UTC: second real check returned the same result, with no duplicate Gmail message and the same pending Telegram item.
- Project triggers page: zero triggers. Permanent surveillance is still disabled.

## Remaining Telegram prerequisite

The bot has not observed a private message from the intended user. The local PC network blocked the bot's t.me page with an enterprise web-filter message; this restriction was not bypassed. The owner needs to open the bot from their Telegram phone app and press Start or send /start. Then run sentinelleDiscoverTelegramChat and one sentinelleCheckOnce to deliver ONLY the already-pending Telegram test; do not enqueue another dual-channel test, because Gmail delivery is already complete.

## Status

Gmail: received and verified. Pathé checks and baseline persistence: validated twice. Telegram: not yet sent. Scheduling: disabled pending both-channel validation. Detailed times, IMAX Laser mapping, purchase URLs and seat inventory remain separate unvalidated features.
