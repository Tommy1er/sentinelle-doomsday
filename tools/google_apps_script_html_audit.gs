/**
 * Diagnostic one-shot: inspect only structural booking clues in the HTML
 * returned by Google Apps Script from the official Pathé film page.
 *
 * Does not book, log in, bypass restrictions, send messages or set triggers.
 * Run manually; output contains no page bodies, cookies or access tokens.
 */
function auditPatheHtmlStructure() {
  const url = "https://www.pathe.ma/fr/films/avengers-doomsday-55389";
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    validateHttpsCertificates: true,
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  const body = res.getContentText();
  const status = res.getResponseCode();
  const patterns = {
    no_sessions_message: /il n.y a pas de s[eé]ance programm[eé]e pour ce film/i,
    next_data_script: /<script[^>]+id=["']__NEXT_DATA__["']/i,
    nuxt_payload: /__NUXT__|__NUXT_DATA__/i,
    json_ld: /<script[^>]+type=["']application\/ld\+json["']/i,
    screening_event: /ScreeningEvent/i,
    showtime_token: /showtimes?|show_time|showTimes/i,
    session_token: /s[eé]ances?|sessions?/i,
    performance_token: /performances?/i,
    imax_token: /\bIMAX\b/i,
    booking_action_token: /r[eé]server|booking|reservation/i,
  };
  const hits = {};
  for (const key in patterns) hits[key] = patterns[key].test(body);

  // Inspect candidate booking-related keys without extracting their values
  // (values can contain session identifiers or live URLs).
  const keyNames = [];
  const keyRegex = /["']([A-Za-z_][A-Za-z0-9_]{2,50})["']\s*:/g;
  let match;
  const relevantKey = /show|screen|session|s[eé]ance|cinema|movie|film|format|booking|reservation|performance|schedule|date/i;
  while ((match = keyRegex.exec(body)) !== null && keyNames.length < 30) {
    const name = match[1];
    if (relevantKey.test(name) && !keyNames.includes(name)) keyNames.push(name);
  }
  const result = {
    at_utc: new Date().toISOString(),
    source: "google_apps_script_html_audit",
    http_status: status,
    body_length: body.length,
    film_name_seen: /avengers\s*[:\-]?\s*doomsday/i.test(body),
    indicators: hits,
    candidate_key_names: keyNames,
    // This is intentionally null: do not infer bookability from keywords.
    bookability_confirmed: null,
    note: "Structural clues only; verify actual sessions and their purchase URLs separately.",
  };
  console.log(JSON.stringify(result));
  return result;
}
