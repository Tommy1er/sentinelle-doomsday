/**
 * One-shot Google Apps Script probe of booking-related JSON VALUES in Pathé HTML.
 * Only read-only diagnostics. No triggers, Telegram, email or booking.
 */
function auditPatheBookingValues(targetUrl) {
  const url = targetUrl || "https://www.pathe.ma/fr/films/avengers-doomsday-55389";
  if (!/^https:\/\/www\.pathe\.ma\/fr\/films\/[a-z0-9-]+$/.test(url)) {
    throw new Error("Only official Pathe film pages are accepted");
  }
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true, followRedirects: true,
    validateHttpsCertificates: true,
    headers: { Accept: "text/html,application/xhtml+xml" }
  });
  const body = response.getContentText();
  const fields = [
    "showtimes", "shows", "salesOpeningDatetime",
    "showtimesDisplayDatetime", "next24ShowtimesCount",
    "nearbySessionsCinema", "movie", "cinemas",
    "bookingUrl", "startDate"
  ];
  const properties = {};
  fields.forEach(function(key) {
    properties[key] = patheFindValues_(body, key, 4);
  });
  const report = {
    checked_at_utc: new Date().toISOString(), url: url,
    http_status: response.getResponseCode(), html_length: body.length,
    no_sessions_text: /il n.y a pas de s[eé]ance programm[eé]e pour ce film/i.test(body),
    properties: properties,
    booking_confirmed: null,
    warning: "Template keys and release dates do not establish real bookability."
  };
  console.log(JSON.stringify(report));
  return report;
}

function patheReadJson_(html, startAt) {
  let i = startAt;
  while (i < html.length && /\s/.test(html[i])) i++;
  const start = i, first = html[i];
  if (first === "{" || first === "[") {
    const stack = [];
    let quote = false, escape = false;
    for (; i < html.length && i - start <= 300000; i++) {
      const ch = html[i];
      if (quote) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') quote = false;
      } else if (ch === '"') quote = true;
      else if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" || ch === "]") {
        const open = stack.pop();
        if ((open === "{" && ch !== "}") || (open === "[" && ch !== "]") || !open) return { ok: false, cause: "unbalanced" };
        if (stack.length === 0) { i++; break; }
      }
    }
    if (stack.length) return { ok: false, cause: "unterminated" };
  } else if (first === '"') {
    let escape = false, ended = false;
    i++;
    for (; i < html.length; i++) {
      const ch = html[i];
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') { i++; ended = true; break; }
    }
    if (!ended) return { ok: false, cause: "unterminated_string" };
  } else {
    while (i < html.length && !/[,}\]<\s]/.test(html[i])) i++;
  }
  try { return { ok: true, value: JSON.parse(html.slice(start, i)) }; }
  catch (_) { return { ok: false, cause: "not_json" }; }
}

function patheSafeSummary_(value, depth) {
  if (value === null) return { type: "null" };
  if (typeof value === "string") return { type: "string", length: value.length, sample: value.slice(0, 90) };
  if (typeof value === "number" || typeof value === "boolean") return { type: typeof value, value: value };
  if (Array.isArray(value)) {
    const out = { type: "array", count: value.length };
    if (depth < 2) out.samples = value.slice(0, 2).map(function(x) { return patheSafeSummary_(x, depth + 1); });
    return out;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    const out = { type: "object", keys: keys.slice(0, 30), key_count: keys.length };
    if (depth < 2) {
      const wanted = /^(id|date|startDate|startDatetime|startTime|startsAt|salesOpeningDatetime|showtimes|shows|cinema|cinemaId|cinemaName|format|technology|experience|bookingUrl|reservationUrl|isBookable|bookable|available|status)$/i;
      const sample = {};
      keys.filter(function(k) { return wanted.test(k); }).slice(0, 8).forEach(function(k) {
        sample[k] = patheSafeSummary_(value[k], depth + 1);
      });
      if (Object.keys(sample).length) out.selected = sample;
    }
    return out;
  }
  return { type: typeof value };
}

function patheFindValues_(html, key, maxCount) {
  const rx = new RegExp('["\\x27]' + key + '["\\x27]\\s*:', "g");
  const results = [];
  let m;
  while ((m = rx.exec(html)) !== null && results.length < maxCount) {
    const v = patheReadJson_(html, m.index + m[0].length);
    results.push(v.ok ? { parsed: true, summary: patheSafeSummary_(v.value, 0) } : { parsed: false, reason: v.cause });
  }
  return {
    observed: results.length,
    escaped_mention_count: html.split('\\"' + key + '\\"').length - 1,
    values: results
  };
}

function testPatheValueInspectorFixture() {
  const html = '{"showtimes":[],"shows":[{"startDate":"2026-12-16","cinemaName":"Pathé Californie","format":"IMAX","bookingUrl":"https://www.pathe.ma/fr/"}],"salesOpeningDatetime":"2026-11-29T10:00:00+01:00"}';
  const empty = patheFindValues_(html, "showtimes", 4);
  const shows = patheFindValues_(html, "shows", 4);
  const sales = patheFindValues_(html, "salesOpeningDatetime", 4);
  if (empty.values[0].summary.count !== 0) throw Error("Empty array fixture failed");
  if (shows.values[0].summary.count !== 1) throw Error("Shows array fixture failed");
  if (sales.values[0].summary.sample !== "2026-11-29T10:00:00+01:00") throw Error("Sales datetime fixture failed");
  console.log("PASS value inspector fixtures");
  return true;
}
