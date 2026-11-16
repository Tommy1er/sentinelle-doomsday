/**
 * Sentinelle Doomsday — Google Apps Script connectivity smoke test.
 *
 * Read-only. Run manually one time from script.google.com.
 * Requires authorization for UrlFetchApp.
 * It deliberately DOES NOT declare ticket sales open.
 * No scheduled trigger, email, Telegram, login or credential.
 */
function testPatheGoogleEgress() {
  const url = "https://www.pathe.ma/fr/films/avengers-doomsday-55389";
  const report = {
    checked_at_utc: new Date().toISOString(),
    source: "google_apps_script_urlfetch",
    target: url,
    http_status: null,
    body_length: null,
    film_name_seen: false,
    explicit_no_sessions: false,
    cloud_readable: false,
    error_type: null,
  };
  try {
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    const body = response.getContentText();
    report.http_status = response.getResponseCode();
    report.body_length = body.length;
    // Presence of film name MAY be metadata only. No booking claim is possible here.
    report.film_name_seen = /avengers\s*[:\-]?\s*doomsday/i.test(body);
    report.explicit_no_sessions = /il n.y a pas de s[eé]ance programm[eé]e pour ce film/i.test(body);
    report.cloud_readable = report.http_status === 200 && report.film_name_seen;
  } catch (error) {
    report.error_type = String((error && error.name) || "UrlFetchError");
  }
  console.log(JSON.stringify(report));
  return report;
}
