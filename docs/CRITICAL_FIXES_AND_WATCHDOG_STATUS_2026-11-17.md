# Critical fixes and watchdog status — 17 November 2026

## Repository changes and local validation

The PR #4 source removes the fixed V5401 restriction from the official booking-link pattern, extends anchors to 13–20 December and rotates extra dates within a 20-date cycle. This intervention also fixes the *core programming detector's* outage reminders: it now alerts at failure 3, then every 12 failures starting at 12, matching the already-corrected detailed detector.

New deterministic tests exercise both failure paths through failures 3, 12, 24, 36 and 48, rebuilding the JavaScript context at failure 36 while retaining persistent properties. Both paths passed. The existing ten integrated booking checks and adversarial resilience tests also passed locally. None of these tests sent real notifications.

### Identifier evidence must remain precise

The modified fixture uses a synthetic V98765S70001 link; it proves that the parser is no longer arbitrarily locked to the witness prefix. It does NOT establish Doomsday's future booking identifier. Earlier browser observations included an official cinema redirect path `/redirect/fr/cinema/vista/5401`, so the claim that 5401 is specifically a *film* identifier is not demonstrated. Keep the strict official host and route checks, and ground cinema/film attribution in the detailed source endpoint and actual booking-page context.

## External watchdog candidate

Added `tools/google_apps_script_watchdog.gs` and eleven offline tests. The wrapper `sentinelleRunWithWatchdog()` calls the integrated monitor, then acknowledges success only after a fully healthy result: no core error, every requested date valid, no unknown or failed detailed dates, no partial calendar coverage and no pending alert channel. It never pings in finally. The private UUID URL must be stored as Script Property `HC_PING_URL`; no URL or UUID has been configured or committed.

The HTTP client requires the exact successful response body `OK`, not HTTP 200 alone. Official Healthchecks documentation notes that UUID pings can return HTTP 200 with `OK (not found)` or `OK (rate limited)`; those must not be mistaken for an acknowledged heartbeat. Tests cover both cases and redact the private URL from transport exceptions.

Source: https://healthchecks.io/docs/http_api/

The policy deliberately treats partial per-cycle date coverage as degraded. With a long rotating calendar, this means the watchdog cannot claim full immediate coverage merely because the selected subset succeeded. A later refinement may track freshness for an entire rotation, but its guarantees and stale-date threshold must be tested before changing this conservative policy.

**This watchdog is prepared in code only. No Healthchecks check, integration, private ping URL, real ping or external missing-heartbeat alert has been verified.** An offline mock is not a real outage simulation.

## Actual browser outcome and deployment boundary

- The existing Apps Script project was identified; its latest previously validated installed build remains the PR #3 integration documented in GOOGLE_BOOKING_LIVE_RESULT_2026-11-17.md.
- Chrome then repeatedly timed out on focus/read commands for the project, and a fresh temporary editor tab also failed to navigate. No PR #4 code was typed into or installed in Apps Script during this intervention. No eight-anchor runtime measurement was obtained.
- Healthchecks homepage and login were readable initially. A magic-login-link request reached the service's `login_link_sent` page. Two focused Gmail searches did not find a Healthchecks email. No successful account login or creation was observed; no new account or check is claimed.
- No attempt was made to bypass login or network controls.
- Both tabs created for this intervention were closed. The final browser tab listing contained only the original Apps Script tab; the browser then reported a post-execution timeout and reset its session.

## Next concrete validation

Restore the Chrome extension connection, install the PR #4 core/classifier/booking source while preserving private properties and outbox, then run two measured real checks of all eight anchors and the read-only witness control. Only then assess current runtime cost. Complete Healthchecks access, create a private success check and email integration, test acknowledgement and a controlled missing-heartbeat alert, and pause the test check after the experiment so the unscheduled monitor does not produce misleading recurring down notices.

No permanent or pilot trigger was created. Main was not merged or modified. The installed engine is not equivalent to the new repository branch; permanent surveillance remains disabled.
