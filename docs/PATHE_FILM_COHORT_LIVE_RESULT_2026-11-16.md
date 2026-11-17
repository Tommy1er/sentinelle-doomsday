# Pathé Morocco: live film-cohort and booking-flow audit

Observations performed on 16 November 2026 UTC. Classifier regression work completed on 17 November. These timestamps are historical observations, not a current availability guarantee.

## Real cohort execution in Google Apps Script

Project: Pathe-Connectivity-Smoke. Added FilmCohort.gs while preserving Code.gs and Sentinel.gs, Script Properties and credentials. No recurring trigger or notification was created by these audits.

The four-film audit completed at 2026-11-16T16:29:34.898Z. Film HTML and cinema APIs returned HTTP 200 for all four films; no request/schema errors were observed.

| Film | Californie dates | Versions | Tags |
|---|---|---|---|
| Avengers: Doomsday | none | none | none |
| Comment braquer une banque ? | 16 and 17 November | vf-ma, vostfr-ma | DEFAULT, pmr |
| Aya et Hadi | 16 and 17 November | vo-ma | DEFAULT, PREMIUM, pmr, vip_fr |
| Scrooge / Ebenezer | 16 and 17 November | vf-ma, vostfr-ma | DEFAULT, PREMIUM, pmr, vip_fr |

The cohort's nine offline fixtures passed in Apps Script at 16:29:58 UTC. Its bookabilityConfirmed=false is a conservative unverified flag, not evidence that sales are closed. No detailed showtime response was cached in ng-state on these film pages.

## Browser positive booking control

Film: Comment braquer une banque ?, Pathé Californie, 16 November, 22:30 VOSTFR, Salle 4.

The session modal exposed the public link:
https://s.pathe.ma/fr/V5401S53301/booking

Following it reached the real booking site with headings **Sélectionnez vos places** and **101 places libres**. Capacity displayed in the film modal was 108 seats. The browser URL added a navigation-position parameter; it was not needed to identify the public booking route.

No seat was selected, no price/cart was submitted and no payment was made. The booking tab opened for this check was closed. The pre-existing user film and Apps Script tabs were left open, with the film restored to its initial film URL.

## Observed detailed API and Google verification

The normal browser's resource inventory exposed these exact paths, rather than importing an unverified France route:

- /api/show/comment-braquer-une-banque-56359/showtimes/cinema-pathe-californie/2026-11-16
- /api/show/scrooge-ebenezer-54897/showtimes/cinema-pathe-californie/2026-11-16

Both were fetched read-only from Google twice, at 16:32:02/03 and 16:34:18/19 UTC. Both returned HTTP 200 with unchanged public session data. The first contained two sessions and the second three. The real response schema includes time, version, tags, status, reservabilityStart, reservabilityEnd, refCmd, auditoriumName, auditoriumCapacity, endTime, isMovie and specialShowtimeDetails.

The real 22:30 record had status=available, reservabilityStart=2026-10-16T16:52:03+00:00, reservabilityEnd=2026-11-16T22:50:00+00:00 and refCmd=https://s.pathe.ma/fr/V5401S53301/booking. This matches the link positively verified to reach seating. The naive time string is retained as local display time; explicit-offset reservation timestamps must not be parsed in the execution host's implicit timezone. The source's precise reservation-time conventions still need broader cross-checking.

## IMAX evidence and limits

/api/tags returned the official slug **imax**, title IMAX and badge Salle IMAX. This supports matching that exact tag instead of treating PREMIUM or VIP as IMAX. The IMAX filter was disabled on the cinema programme displayed during this check. No real IMAX session or Laser-specific capability was validated. A global marketing description or mere presence of the tag in site settings is insufficient to label a particular screening IMAX Laser.

## Regression candidate added to PR #2

- tools/google_apps_script_showtime_signal.gs: pure detailed-session classifier, no network, no credentials, no triggers.
- tests/fixtures/pathe_californie_real_showtimes_2026-11-16.json: the two real public records observed for the positive film.
- tests/test_google_apps_script_showtime_signal.js: 15 local checks, passed. Explicitly synthetic mutations cover crossing an opening instant with otherwise unchanged metadata, closing boundary, unknown status, missing/malicious/wrong-cinema links, timezone-less windows, reversed windows, impossible dates, ordering/deduplication and the distinction between IMAX tags, Laser and seats.
- CI workflow now runs the added test script.

The candidate exposes **bookingProposedByApi**, not guaranteed seat inventory or successful checkout. It evaluates status, official cinema-scoped booking URL and the explicit reservation window on EVERY check, so a future opening instant is observable even when date/version/tag metadata does not change.

## Critical deployment gap

The installed sentinel still compares dates/versions/tags only. The new detailed classifier is a separately tested candidate; it is NOT integrated into that installed loop and is not scheduled. Integration must query detailed sessions on every programmed-date check, not just after a /cinemas hash change, and persist the effective reservation signal. Handle network/schema failure as unknown, preserve previous healthy evidence, and validate independently retryable channels. Do not claim that live unavailable-to-available transition was observed: the positive films were already available; opening-time transitions were simulated from the real schema.

Gmail inbox receipt and Telegram server acceptance were validated earlier, as recorded in GOOGLE_NOTIFICATION_VALIDATION_2026-11-16.md and TELEGRAM_DELIVERY_RESULT_2026-11-16.md on feat/aws-pathe-preflight. No extra real notifications were sent by this cohort diagnostic. Permanent monitoring remains disabled. No AI layer is required to interpret these deterministic fields.
