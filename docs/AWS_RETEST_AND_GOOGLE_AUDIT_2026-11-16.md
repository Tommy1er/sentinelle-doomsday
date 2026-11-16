# AWS retest and Google HTML audit — 16 November 2026

## AWS CloudShell

The CloudShell terminal started successfully in eu-north-1 after the user's registration update. The public diagnostic branch was cloned and the following command ran:

```sh
python3 sentinelle-diagnostic-20261116/tools/aws_smoke.py --mode http
```

Observed output at **2026-11-16T15:11:02+00:00**:

```json
{"mode":"http","http_status":403,"film_name_seen":false,"explicit_no_sessions":false,"usable":false,"error_type":"HTTPError"}
```

This supersedes the earlier CloudShell-access blockage. It does not establish the reason for Pathé's rejection or demonstrate how Chromium would behave on AWS. No paid upgrade, EC2 instance, Lambda function or recurring AWS resource was created.

## Google Apps Script HTML audit

The repository function auditPatheHtmlStructure was saved alongside testPatheGoogleEgress in the existing Pathe-Connectivity-Smoke project and executed manually. No trigger or notification was created.

Observed at **2026-11-16T15:11:42.950Z**:

```json
{"source":"google_apps_script_html_audit","http_status":200,"body_length":274660,"film_name_seen":true,"indicators":{"no_sessions_message":true,"next_data_script":false,"nuxt_payload":false,"json_ld":true,"screening_event":false,"showtime_token":true,"session_token":true,"performance_token":true,"imax_token":true,"booking_action_token":true},"candidate_key_names":["dateCreated","showFilter","isMovie","next24ShowtimesCount","salesOpeningDatetime","showtimesDisplayDatetime","extraInformation","nearbySessionsCinema","nearbySessionsWording","cgpsession","showtimesMultiSelectionEnabled","cinemaFullListEnabled","show","multipleReleasedDatesEnabled","showtimes","cinemaNameEnabled","cinemas","favoriteCinemas","favoriteCinemasCookieName","maxGeolocationCinemas","cinemaCount","shows","movie","isShowFilter","isCinemaFilter","isShowFlag","orderShowFlag","showFlagColor","isCinemaFlag","cinemaFlagOrder"],"bookability_confirmed":null}
```

The response contains promising structured booking-related keys, but these may be configuration or template data. Neither keywords nor JSON-LD alone prove that current or future screenings, cinema-specific IMAX formats or purchase links are available in server-rendered data. No ticket-opening claim is made.

## Next technical gate

Inspect the actual values and schema around showtimes/shows/movie and validate a real scheduled film at Pathé Californie. Then implement a cinema-specific semantic detector, test an opening fixture and independently verify Gmail/Telegram delivery. Keep permanent surveillance disabled until those checks pass.
