# Real Google Apps Script booking integration — 17 November 2026

## Installed source

Project: Pathe-Connectivity-Smoke. Core source pinned to PR #3 commit `11fa8013b7cde6af51e0dd6ce6c755fe01730fa1`.

- Updated Sentinel.gs with the audited sentinel core and retained Telegram setup helper.
- Added BookingIntegration.gs containing the pinned detailed classifier, booking monitor and the separately committed integration probe.
- Retained Code.gs, FilmCohort.gs, private Script Properties and the existing alert queue. No secrets were read back or published.
- Reloading the editor confirmed all four files persist.
- The measured wrapper invokes the actual `sentinelleCheckWithBookingOnce()` entry point. It adds a build marker, elapsed time and known-state counters; it does not change dates, network responses or alert logic.

## Real target checks

| Start (UTC) | Measured engine duration | Programme | Detailed dates valid / attempted | Unknown / failed | Sessions stored per anchor | New reservation signals | Delivery T / G / pending |
|---|---:|---|---|---|---|---:|---|
| 10:04:44.280 | 6513 ms | NO_PROGRAMME_FOR_CINEMA | 3 / 3 | 0 / 0 | 0, 0, 0 | 0 | 0 / 0 / 0 |
| 10:05:11.624 | 4095 ms | NO_PROGRAMME_FOR_CINEMA | 3 / 3 | 0 / 0 | 0, 0, 0 | 0 | 0 / 0 / 0 |

The anchor dates were **2026-12-16, 2026-12-17, 2026-12-18**. In the pinned reader, VALID requires HTTP 200, JSON parsing and the detailed-array classifier to pass. Each anchor persisted an empty array. Thus the previously hypothetical pre-programming routes now returned valid empty session lists, not 404, during these two observations.

No core error, detailed error, new sale signal, notification or pending item was observed. The detailed failure streak was zero after both runs. Detailed last-success timestamps were 10:04:50.256Z and 10:05:15.439Z.

The mean of these two measured engine durations is **5304 ms**; the maximum is 6513 ms. At 288 daily runs, 5.304 seconds per run would represent about **25.46 minutes/day**, arithmetic only. Two manual samples do not establish scheduled-runtime averages, worst-case latency, quotas under an expanded programme, or 24-hour reliability. Apps Script execution-log duration also includes overhead outside the measured function.

## Independent read-only positive control

At **10:05:58.891Z**, `sentinelleReadOnlyPositiveControl()` used the same `sentinelleDetailedRead_` and classifier with `comment-braquer-une-banque-56359`, Californie, local date **2026-11-17**. It restored the target film in a finally block. It did not call the alert queue or write a replacement target baseline.

Result: VALID, two sessions, both reservation-proposed API signals; duration 1285 ms; notifications sent 0.

| Local session time | Version | API status | API proposed | Public purchase link |
|---|---|---|---|---|
| 2026-11-17 22:30:00 | vostfr-ma | available | true | https://s.pathe.ma/fr/V5401S53347/booking |
| 2026-11-17 17:30:00 | vf-ma | available | true | https://s.pathe.ma/fr/V5401S53348/booking |

Both have imax=false and laserConfirmed=false. These 17-November purchase links were returned by the API; no new booking page, seat selection or payment was attempted. The separately documented 16-November control had previously reached a real seating screen.

## Trigger and browser verification

The project triggers page explicitly displayed **zero triggers**. No schedule was created. No new browser tab was opened during this intervention; the pre-existing user tabs were left open, and the project was returned to its editor.

## Remaining limits

- The actual integrated target and positive-control reads succeeded. No real transition from closed to open sales occurred during these samples, and no real event was available to test transport delivery through this integrated loop.
- Earlier Gmail inbox receipt and Telegram API acceptance remain separately documented; phone display acknowledgement is not claimed here.
- No actual IMAX screening was attributed to the Laser auditorium during this intervention.
- No independent watchdog, recurring trigger or 24-hour pilot was installed.
- A programme exceeding the configured coverage/storage limits must be treated as a coverage incident. The current three anchors are bounded probes, not proof that every future presale date is covered.

Permanent monitoring remains disabled as requested for this real integration test. The repository source is still under PR review; no merge to main was performed.
