/**
 * Pure classifier for Pathé Morocco detailed showtimes (schema observed 2026-11-16).
 * No network, properties or notifications.
 *
 * FAIL-OPEN POLICY (2026-11-20): the only costly error for this monitor is a
 * MISSED opening. A cosmetic surprise in one field (new booking-URL shape,
 * missing or timezone-less sales window, duplicate row, after-midnight show)
 * must never discard the whole date. Such fields degrade to "unknown" and the
 * session stays visible, so the monitor can still alert.
 *
 * Only a payload that is not an array, or a row that is not an object with a
 * usable "time" and "status", still throws: the monitor turns that into an
 * immediate ANOMALY alert when the array is non-empty.
 *
 * bookingProposedByApi is an API signal; it does not prove seats or checkout.
 */
var PATHE_TRUSTED_BOOKING_HOSTS = ["s.pathe.ma", "www.pathe.ma", "pathe.ma"];

function patheParseInstant_(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return null;
  }
  var parts = value.slice(0, 10).split("-").map(Number);
  var calendar = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (calendar.getUTCFullYear() !== parts[0] || calendar.getUTCMonth() !== parts[1] - 1 ||
      calendar.getUTCDate() !== parts[2]) {
    return null;
  }
  var parsed = Date.parse(value);
  return isFinite(parsed) ? parsed : null;
}

/** Returns the link if it is an https URL on an official Pathé Morocco host, else null. */
function patheTrustedBookingUrl_(link) {
  if (typeof link !== "string" || link.length > 300) return null;
  var m = /^https:\/\/([a-z0-9.-]+)(\/[^\s"'<>]*)?$/i.exec(link);
  if (!m) return null;
  return PATHE_TRUSTED_BOOKING_HOSTS.indexOf(m[1].toLowerCase()) !== -1 ? link : null;
}

function patheShowtimeSignalsV1(payload, nowUtc) {
  var now = patheParseInstant_(nowUtc);
  if (now === null) throw new Error("Explicit-offset timestamp required");
  if (!Array.isArray(payload) || payload.length > 1000) throw new Error("Invalid showtime array");
  var seen = {};
  return payload.map(function(s) {
    if (!s || typeof s !== "object" || Array.isArray(s) ||
        typeof s.time !== "string" ||
        !/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(s.time) ||
        typeof s.status !== "string" || !s.status || s.status.length > 64) {
      throw new Error("Invalid detailed showtime schema");
    }
    var d = s.time.slice(0, 10), p = d.split("-").map(Number);
    var utc = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    if (utc.getUTCFullYear() !== p[0] || utc.getUTCMonth() !== p[1] - 1 || utc.getUTCDate() !== p[2]) {
      throw new Error("Invalid local calendar date");
    }
    var version = typeof s.version === "string" && s.version ? s.version.slice(0, 50) : "version inconnue";
    var tags = Array.isArray(s.tags)
      ? Array.from(new Set(s.tags.filter(function(t) { return typeof t === "string"; })
          .map(function(t) { return t.slice(0, 100); }))).sort()
      : [];

    // Sales window: unknown (null) rather than fatal when absent or malformed.
    var start = patheParseInstant_(s.reservabilityStart);
    var end = patheParseInstant_(s.reservabilityEnd);
    if (start !== null && end !== null && start >= end) { start = null; end = null; }
    var windowKnown = start !== null || end !== null;
    var inWindow = (start === null || now >= start) && (end === null || now < end);

    // Link: only an official https Pathé host is ever shown to the user.
    // An untrusted link is dropped (anti-phishing) but the session is kept.
    var rawLink = s.refCmd;
    var link = patheTrustedBookingUrl_(rawLink);
    var linkUntrusted = rawLink !== null && rawLink !== undefined && rawLink !== "" && link === null;
    var vid = link ? /\/V(\d+)S\d+/.exec(link) : null;

    var key = link || s.time + "|" + version + "|" + String(s.auditoriumName || "");
    if (seen[key]) { seen[key]++; key = key + "#" + seen[key]; } else { seen[key] = 1; }

    return {
      id: key, localTime: s.time, localTimeZone: "Africa/Casablanca",
      version: version, tags: tags, status: s.status,
      reservabilityStart: start !== null ? s.reservabilityStart : null,
      reservabilityEnd: end !== null ? s.reservabilityEnd : null,
      salesWindowKnown: windowKnown,
      salesNotYetOpen: start !== null && now < start,
      bookingUrl: link, linkUntrusted: linkUntrusted, filmVid: vid ? vid[1] : null,
      bookingProposedByApi: s.status === "available" && link !== null && inWindow,
      imaxByTag: tags.some(function(t) { return t.toLowerCase() === "imax"; }),
      imaxLaserConfirmed: false, seatsKnown: false
    };
  }).sort(function(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
}
