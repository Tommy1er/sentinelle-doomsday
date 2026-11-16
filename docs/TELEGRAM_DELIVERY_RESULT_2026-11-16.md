# Telegram test delivery — 16 November 2026

The owner sent /start to the bot from their Telegram phone app. At 16:07:29 UTC, sentinelleDiscoverTelegramChat found exactly one private-chat candidate and saved it to private Script Properties. The chat ID and bot token are not published.

At 16:07:54.276 UTC, sentinelleCheckOnce returned:

```json
{"status":"NO_PROGRAMME_FOR_CINEMA","dates":0,"change":false,"attemptedNotifications":{"telegram":1,"gmail":0,"pending":0}}
```

Only the previously pending Telegram TEST was retried; no new TEST event was enqueued and Gmail was not sent again. The Telegram transport validates HTTP 200 and Bot API ok=true before marking delivery complete. This confirms Telegram server acceptance, not phone-display acknowledgement. Gmail had already been independently verified in the inbox at 16:00:38 UTC.

The bot does not run a webhook or polling responder, so /start has no immediate automatic reply by itself. It enabled discovery of the intended private conversation.

No scheduled trigger was added in this intervention. Detailed session times, IMAX Laser tag mapping, ticket-purchase links and seat inventory remain unvalidated. The latest cinema-scoped Pathé check still found no programmed dates for Doomsday at Pathé Californie.
