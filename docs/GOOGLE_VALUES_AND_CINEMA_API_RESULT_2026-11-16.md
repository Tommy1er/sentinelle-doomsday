# Google: value audit and cinema-specific programming — 16 November 2026

## Executed manually in Apps Script

Project: Pathe-Connectivity-Smoke. Existing smoke and HTML audit functions were retained. No triggers, messages, credentials, purchases or reservations were created.

| Check (UTC) | Result |
|---|---|
| 15:24:24 — testPatheValueInspectorFixture | PASS value inspector fixtures |
| 15:24:39.803 — auditPatheBookingValues (Doomsday) | HTTP 200; 274675 HTML characters |
| 15:25:46.846 — comparison film value audit | HTTP 200; 336166 HTML characters |
| 15:27:10 — rendered-button audit of both films | HTTP 200; no matching server-rendered book-screening buttons on either response |
| 15:28:13.879 / 15:28:16.017 — transfer-cache schema audit | ng-state parsed for both film responses |
| 15:29:07.480 — direct Doomsday cinemas API | HTTP 200; JSON object {} |
| 15:29:08.757 — direct comparison-film cinemas API | HTTP 200; 710 characters; two cinema keys with dates and tags |

The comparison film was https://www.pathe.ma/fr/films/comment-braquer-une-banque-56359 . In Chrome its film page displayed Pathé Californie, today, 17:30 VF and 22:30 VOSTFR. No session button was clicked and no ticket was reserved.

## Critical false-signal findings

1. The complete HTML contains the no-session wording on BOTH the unavailable film and the film with real displayed sessions. A whole-body regex for that wording is not a valid availability detector.
2. The showtimes property examined is site configuration (versionListSortEnabled, kidsLogoEnabled, versionFilterByTagEnabled, tagHighlighting), not a list of screenings.
3. The first shows occurrences include null city lists, footer film suggestions and the global catalogue. Neither their presence nor array sizes establish sessions for the target film.
4. First-occurrence next24ShowtimesCount values were 0 for Doomsday and 5 for the comparison film, but later values refer to other films. Scope to the target API response before using such metadata. It is also a 24-hour counter, so it cannot detect all future presales.
5. The observed Google HTML did not contain the live book-screening buttons seen after the browser renders the page. Do not use their absence in server HTML as evidence of no programme.

## Useful public API discovered, then tested directly

The public HTML embeds Angular transfer-cache data in script id=ng-state. Matching cached response URLs (u), rather than scanning generic field names, identifies each API response body (b).

Observed URLs:

- https://www.pathe.ma/api/show/avengers-doomsday-55389/cinemas
- https://www.pathe.ma/api/show/comment-braquer-une-banque-56359/cinemas

Both URLs were then fetched directly by UrlFetchApp with Accept: application/json. Both returned 200. Doomsday returned exactly {}.

The comparison response returned:

```json
{
  "cinema-pathe-californie": {
    "days": {
      "2026-11-16": {"tags":["DEFAULT","pmr"],"upsell":null,"versions":["vf-ma","vostfr-ma"],"specialShowtime":false,"highlightedShowtime":null},
      "2026-11-17": {"tags":["DEFAULT","pmr"],"upsell":null,"versions":["vf-ma","vostfr-ma"],"specialShowtime":false,"highlightedShowtime":null}
    },
    "releasedAt":"2026-11-13"
  },
  "cinema-pathe-dar-essalam": {
    "days": {
      "2026-11-16": {"tags":["DEFAULT","pmr","PREMIUM","vip_fr"],"upsell":null,"versions":["vostfr-ma"],"specialShowtime":false,"highlightedShowtime":null},
      "2026-11-17": {"tags":["DEFAULT","pmr","PREMIUM","vip_fr"],"upsell":null,"versions":["vf-ma","vostfr-ma"],"specialShowtime":false,"highlightedShowtime":null}
    },
    "releasedAt":"2026-11-13"
  }
}
```

This validates a lightweight source for cinema-specific programmed dates, versions and tags. It does not yet validate individual start times, IMAX Laser tag mapping, purchase URLs, seat inventory or payment availability. Do not borrow Rabat's VIP tags for Californie.

## Recommendation for implementation

Use the exact target film endpoint, validate HTTP/JSON/schema before classifying it, then select only cinema-pathe-californie.days. Compare stable date/version/tag data, not full HTML. Distinguish programmed dates from confirmed booking inventory. Keep network/JSON/schema errors separate from an empty programme. Validate IMAX tags using the observed /api/tags metadata and an actual IMAX programme. Use the official film page as the safe human-review link until a real purchase-link schema is established.

No permanent monitoring or Gmail/Telegram alerts were enabled. The next remaining gates are the cinema-specific detector and regression fixtures, detailed booking data, and independent delivery tests for both notification channels.
