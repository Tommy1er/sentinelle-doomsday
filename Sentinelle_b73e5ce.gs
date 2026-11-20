// ===== BEGIN tools/google_apps_script_sentinel.gs =====
/**
 * Sentinelle Doomsday: Google Apps Script monitor candidate (not scheduled).
 * Target is the OFFICIAL cinema-scoped Pathé API; never inspect page-wide
 * generic "shows" or "no sessions" strings to infer availability.
 *
 * Credentials and recipient addresses go only in Apps Script Script Properties.
 * No automatic triggers are created by this file.
 */
var DOOMSDAY_SENTINEL = {
  endpoint: "https://www.pathe.ma/api/show/avengers-doomsday-55389/cinemas",
  publicPage: "https://www.pathe.ma/fr/films/avengers-doomsday-55389",
  cinemaKey: "cinema-pathe-californie",
  stateKey: "DOOMSDAY_MONITOR_STATE_V1",
  outboxKey: "DOOMSDAY_MONITOR_OUTBOX_V1",
  failureKey: "DOOMSDAY_MONITOR_FAILURES_V1",
  lastOkKey: "DOOMSDAY_MONITOR_LAST_OK_V1",
  secretEmail: "ALERT_EMAIL_TO",
  secretBot: "TG_BOT_TOKEN",
  secretChat: "TG_CHAT_ID"
};

function sentinellePlainObject_(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sentinelleUniqueStrings_(value, field) {
  if (!Array.isArray(value) || value.length > 30 ||
      value.some(function(s) { return typeof s !== "string" || s.length > 150; })) {
    throw new Error("Invalid " + field + " array in Pathé API response");
  }
  return Array.from(new Set(value)).sort();
}

/**
 * Pure parser. Dates/versions/tags are observable programming only.
 * IMAX mapping, session start times, payment and seats are deliberately unknown.
 */
function sentinelleNormalize_(payload) {
  if (!sentinellePlainObject_(payload)) throw new Error("Invalid root JSON object");
  // Fail closed on unexpected API wrappers or error payloads. HTTP 200 is
  // not proof that the endpoint returned a valid programming document.
  // Fail-open exception: an extra root field next to our cinema must not
  // blind the monitor. Without our cinema, unknown keys remain an error page.
  var unknownKeys = Object.keys(payload).filter(function(key) {
    return !/^cinema-[a-z0-9-]+$/.test(key);
  });
  var cinema = payload[DOOMSDAY_SENTINEL.cinemaKey];
  if (unknownKeys.length && (cinema === undefined || cinema === null)) {
    throw new Error("Unexpected API root schema");
  }
  if (cinema === null) throw new Error("Null target cinema data");
  if (cinema === undefined) {
    return { status: "NO_PROGRAMME_FOR_CINEMA", cinema: DOOMSDAY_SENTINEL.cinemaKey, days: [] };
  }
  if (!sentinellePlainObject_(cinema) || !sentinellePlainObject_(cinema.days)) {
    throw new Error("Invalid Pathé cinema.days schema");
  }
  var dates = Object.keys(cinema.days);
  if (dates.length > 120) throw new Error("Unexpected number of cinema dates");
  var days = dates.sort().map(function(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Unexpected date key in cinema.days");
    var day = cinema.days[date];
    if (!sentinellePlainObject_(day)) throw new Error("Invalid day object");
    var normalized = {
      date: date,
      versions: sentinelleUniqueStrings_(day.versions, "versions"),
      tags: sentinelleUniqueStrings_(day.tags, "tags")
    };
    // Avant-premières are flagged per day; only stored when true so that
    // existing snapshots stay byte-identical (no false "modified" alert).
    if (day.specialShowtime === true) normalized.special = true;
    return normalized;
  });
  return {
    status: days.length ? "DATES_PROGRAMMED" : "NO_PROGRAMME_FOR_CINEMA",
    cinema: DOOMSDAY_SENTINEL.cinemaKey,
    days: days
  };
}

function sentinelleDiff_(before, after) {
  if (before && JSON.stringify(before.days) === JSON.stringify(after.days)) return null;
  if (!before && after.days.length === 0) return null;
  if (before && before.days.length === 0 && after.days.length === 0) return null;
  var old = {};
  (before ? before.days : []).forEach(function(day) { old[day.date] = day; });
  var additions = after.days.filter(function(day) { return !old[day.date]; });
  var edits = after.days.filter(function(day) {
    return old[day.date] && JSON.stringify(old[day.date]) !== JSON.stringify(day);
  });
  var removed = (before ? before.days : []).filter(function(day) {
    return !after.days.some(function(current) { return current.date === day.date; });
  });
  return {
    type: after.days.length ? "PROGRAMME_CHANGE" : "PROGRAMME_REMOVED",
    firstObservation: !before,
    added: additions, updated: edits, removed: removed,
    totalDays: after.days.length
  };
}

function sentinelleFormatDay_(day) {
  return day.date + " | versions : " + (day.versions.join(", ") || "inconnues") +
    " | tags : " + (day.tags.join(", ") || "non renseignés") +
    (day.special ? " | SÉANCE SPÉCIALE / AVANT-PREMIÈRE" : "");
}

function sentinelleEventMessage_(delta) {
  var title = delta.type === "PROGRAMME_REMOVED" ?
    "⚠️ [DOOMSDAY] Programmation retirée" :
    "🚨 [DOOMSDAY] Programmation détectée ou modifiée";
  var lines = [
    "Cinéma : Pathé Californie — Casablanca",
    "Film : Avengers: Doomsday",
    "Statut : DONNÉES DE PROGRAMMATION (pas une vente de billets confirmée)",
    "Jours actuellement programmés : " + delta.totalDays,
    "Horaires précis : non encore vérifiés",
    "IMAX Laser : non encore vérifié",
    "Lien d'achat et disponibilité de sièges : non encore vérifiés"
  ];
  if (delta.firstObservation) lines.push("Premier contrôle : état déjà programmé.");
  if (delta.added.length) lines.push("Nouvelles dates :\n" + delta.added.map(sentinelleFormatDay_).join("\n"));
  if (delta.updated.length) lines.push("Dates modifiées :\n" + delta.updated.map(sentinelleFormatDay_).join("\n"));
  if (delta.removed.length) lines.push("Dates retirées :\n" + delta.removed.map(sentinelleFormatDay_).join("\n"));
  lines.push("Vérification manuelle : " + DOOMSDAY_SENTINEL.publicPage);
  return { subject: title, body: lines.join("\n\n") };
}

function sentinelleReadJsonProperty_(properties, key, fallback) {
  var raw = properties.getProperty(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (_) { throw new Error("Corrupt stored " + key); }
}

function sentinelleCheckOnce() {
  // Manual execution only. Do not create any scheduled triggers until approved.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error("Other sentinel run in progress");
  var props = PropertiesService.getScriptProperties();
  try {
    var response = UrlFetchApp.fetch(DOOMSDAY_SENTINEL.endpoint, {
      muteHttpExceptions: true, followRedirects: true,
      validateHttpsCertificates: true,
      headers: { Accept: "application/json" }
    });
    var statusCode = response.getResponseCode();
    if (statusCode !== 200) throw new Error("Pathé API returned HTTP " + statusCode);
    var rawText = response.getContentText();
    if (rawText.length > 300000) throw new Error("API response size exceeds limit");
    var parsed = JSON.parse(rawText);
    var current = sentinelleNormalize_(parsed);
    var old = sentinelleReadJsonProperty_(props, DOOMSDAY_SENTINEL.stateKey, null);
    // A single temporary empty response must not erase a previously observed
    // programme. Positive new dates still alert immediately.
    var emptyKey = "DOOMSDAY_MONITOR_EMPTY_STREAK_V1";
    if (old && old.days.length > 0 && current.days.length === 0) {
      var emptyStreak = Number(props.getProperty(emptyKey) || "0") + 1;
      props.setProperty(emptyKey, String(emptyStreak));
      if (emptyStreak < 2) {
        props.setProperty(DOOMSDAY_SENTINEL.lastOkKey, new Date().toISOString());
        props.setProperty(DOOMSDAY_SENTINEL.failureKey, "0");
        var pendingDeliveries = sentinelleFlushOutbox_(props);
        var unconfirmed = { checkedAt: new Date().toISOString(),
          status: "PENDING_EMPTY_CONFIRMATION", dates: old.days.length,
          change: false, attemptedNotifications: pendingDeliveries };
        console.log(JSON.stringify(unconfirmed));
        return unconfirmed;
      }
    } else {
      props.setProperty(emptyKey, "0");
    }
    var delta = sentinelleDiff_(old, current);
    // Store snapshot before attempting either channel. If one channel fails, outbox retains it.
    if (delta) {
      var alert = sentinelleEventMessage_(delta);
      sentinelleEnqueue_(props, alert.subject, alert.body);
    }
    props.setProperty(DOOMSDAY_SENTINEL.stateKey, JSON.stringify(current));
    props.setProperty(DOOMSDAY_SENTINEL.lastOkKey, new Date().toISOString());
    props.setProperty(DOOMSDAY_SENTINEL.failureKey, "0");
    var sent = sentinelleFlushOutbox_(props);
    var result = { checkedAt: new Date().toISOString(), status: current.status,
                   dates: current.days.length, change: !!delta,
                   attemptedNotifications: sent };
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    var failures = Number(props.getProperty(DOOMSDAY_SENTINEL.failureKey) || "0") + 1;
    props.setProperty(DOOMSDAY_SENTINEL.failureKey, String(failures));
    if (failures === 3 || (failures >= 12 && failures % 12 === 0)) {
      sentinelleEnqueue_(props, "⚠️ [DOOMSDAY] Surveillance en échec",
        "Le contrôle de Pathé a échoué " + failures + " fois consécutives.\n" +
        "Dernière réussite : " + (props.getProperty(DOOMSDAY_SENTINEL.lastOkKey) || "aucune") +
        "\nCatégorie : " + String(error.name || "Error") +
        "\n" + DOOMSDAY_SENTINEL.publicPage);
    }
    // Retry independent pending channels even if Pathé is temporarily unreachable.
    try { sentinelleFlushOutbox_(props); } catch (_) {}
    console.log(JSON.stringify({ status: "ERROR", failures: failures, errorType: String(error.name || "Error") }));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function sentinelleEnqueue_(props, subject, body) {
  var outbox = sentinelleReadJsonProperty_(props, DOOMSDAY_SENTINEL.outboxKey, []);
  if (!Array.isArray(outbox)) throw new Error("Corrupt outbox");
  // Apps Script enforces 9 KB per property value. Keep the complete
  // official URL at the end even if a long change list is truncated.
  var maxBody = 1200;
  if (body.length > maxBody) {
    body = body.slice(0, 900) + "\n\n… Détails supplémentaires : consulter Pathé.\n" +
      DOOMSDAY_SENTINEL.publicPage;
  }
  subject = subject.slice(0, 140);
  // When every channel is down, do not brick the detector once its queue is
  // saturated. Coalesce the newest item while retaining the older pending items.
  // A re-armed Telegram channel receives an updated event, not the old item.
  // Never let a routine status message overwrite a pending opening alert.
  var critical = function(text) { return /^🚨|MAINTENANT/.test(String(text || "")); };
  if (outbox.length >= 4) {
    var targetIndex = outbox.length - 1;
    for (var k = outbox.length - 1; k >= 0; k--) {
      if (!critical(outbox[k].subject)) { targetIndex = k; break; }
    }
    if (critical(outbox[targetIndex].subject) && !critical(subject)) {
      console.log("Outbox saturated with critical alerts; routine notice dropped");
      return;
    }
    var latest = outbox[targetIndex];
    latest.id = new Date().getTime() + "-" + Math.random().toString(36).slice(2, 8);
    latest.subject = subject;
    latest.body = "⚠️ Plusieurs évolutions se sont produites pendant une panne d'alertes.\n" + body;
    latest.pending = ["telegram", "gmail"];
  } else {
    outbox.push({ id: new Date().getTime() + "-" + Math.random().toString(36).slice(2, 8),
                  subject: subject, body: body, pending: ["telegram", "gmail"] });
  }
  var encoded = JSON.stringify(outbox);
  // Count actual UTF-8 bytes, not JavaScript UTF-16 code units. When Google
  // Script Properties would exceed its 9-KB/value cap, preserve the latest
  // actionable alert rather than permanently blocking all future checks.
  var byteLength = encodeURIComponent(encoded).replace(/%[0-9A-F]{2}/g, "x").length;
  if (byteLength > 8000) {
    var last = outbox[outbox.length - 1];
    for (var c = outbox.length - 1; c >= 0; c--) {
      if (critical(outbox[c].subject)) { last = outbox[c]; break; }
    }
    last.body = "⚠️ Plusieurs alertes accumulées pendant une panne de livraison.\n" +
      "Dernière évolution : " + body.slice(0, 400) +
      "\nConsulter immédiatement : " + DOOMSDAY_SENTINEL.publicPage;
    last.pending = ["telegram", "gmail"];
    outbox = [last];
    console.log("Pending alerts coalesced to remain within Script Properties quota");
  }
  props.setProperty(DOOMSDAY_SENTINEL.outboxKey, JSON.stringify(outbox));
}

/** Phone notifications show the first line: make sure it says what happened. */
function sentinelleTelegramText_(item) {
  var head = String(item.subject || "").split(" ")[0];
  return head && item.body.indexOf(head) === 0 ? item.body : item.subject + "\n\n" + item.body;
}

function sentinelleSendTelegram_(props, text) {
  var token = props.getProperty(DOOMSDAY_SENTINEL.secretBot);
  var chat = props.getProperty(DOOMSDAY_SENTINEL.secretChat);
  if (!token || !chat) throw new Error("Telegram script properties not configured");
  var r = UrlFetchApp.fetch("https://api.telegram.org/bot" + encodeURIComponent(token) + "/sendMessage", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900),
                              disable_web_page_preview: true })
  });
  var decoded;
  try { decoded = JSON.parse(r.getContentText()); } catch (_) { decoded = null; }
  if (r.getResponseCode() !== 200 || !decoded || decoded.ok !== true) {
    throw new Error("Telegram delivery rejected");
  }
}

function sentinelleSendMail_(props, subject, text) {
  var address = props.getProperty(DOOMSDAY_SENTINEL.secretEmail);
  if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error("ALERT_EMAIL_TO script property not configured");
  }
  // Sends via the current Google Apps Script user's own account.
  // No Gmail password, Google SMTP credential or external service required.
  MailApp.sendEmail({ to: address, subject: subject, body: text });
}

function sentinelleFlushOutbox_(props) {
  var outbox = sentinelleReadJsonProperty_(props, DOOMSDAY_SENTINEL.outboxKey, []);
  if (!Array.isArray(outbox)) throw new Error("Corrupt outbox");
  var delivered = { telegram: 0, gmail: 0, pending: 0 };
  for (var i = 0; i < outbox.length; i++) {
    var item = outbox[i];
    for (var j = 0; j < item.pending.length;) {
      var channel = item.pending[j];
      try {
        if (channel === "telegram") sentinelleSendTelegram_(props, sentinelleTelegramText_(item));
        else if (channel === "gmail") sentinelleSendMail_(props, item.subject, item.body);
        else throw new Error("Unknown channel");
        item.pending.splice(j, 1);
        delivered[channel]++;
        // Persist after EVERY successful channel to avoid retrying one that succeeded.
        props.setProperty(DOOMSDAY_SENTINEL.outboxKey, JSON.stringify(outbox));
      } catch (error) {
        // Do not leak bot tokens, chat ID, email or transport response bodies.
        console.log("Delivery " + channel + " not completed: " + String(error.name || "Error"));
        j++;
      }
    }
  }
  outbox = outbox.filter(function(item) { return item.pending.length > 0; });
  props.setProperty(DOOMSDAY_SENTINEL.outboxKey, JSON.stringify(outbox));
  delivered.pending = outbox.length;
  return delivered;
}

/** Must be invoked explicitly when the owner is ready to send a TEST. */
function sentinelleTestNotifications() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error("Other sentinel run in progress");
  try {
    var props = PropertiesService.getScriptProperties();
    sentinelleEnqueue_(props, "🧪 [DOOMSDAY] TEST des notifications",
      "TEST UNIQUEMENT — aucune ouverture de billetterie détectée.\n" +
      "Test du canal Telegram + Gmail, envoyé depuis Google Apps Script.\n" +
      DOOMSDAY_SENTINEL.publicPage);
    var summary = sentinelleFlushOutbox_(props);
    console.log(JSON.stringify(summary));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

/** Check required property presence, without printing any secret or address. */
function sentinelleConfigCheck() {
  var props = PropertiesService.getScriptProperties();
  var report = {
    emailConfigured: !!props.getProperty(DOOMSDAY_SENTINEL.secretEmail),
    telegramTokenConfigured: !!props.getProperty(DOOMSDAY_SENTINEL.secretBot),
    telegramChatIdConfigured: !!props.getProperty(DOOMSDAY_SENTINEL.secretChat)
  };
  console.log(JSON.stringify(report));
  return report;
}

/** Offline tests. No services called, no credentials read, no notifications sent. */
function testSentinelleParserFixture() {
  function expect(value, msg) { if (!value) throw new Error("Fixture: " + msg); }
  var empty = sentinelleNormalize_({});
  expect(empty.status === "NO_PROGRAMME_FOR_CINEMA" && empty.days.length === 0, "empty Doomsday");
  var other = sentinelleNormalize_({
    "cinema-pathe-dar-essalam": { days: {
      "2026-11-16": { versions: ["vf-ma"], tags: ["PREMIUM"] }
    }}
  });
  expect(other.days.length === 0, "other cinema must not count");
  var open = sentinelleNormalize_({
    "cinema-pathe-californie": { days: {
      "2026-12-16": { versions: ["vostfr-ma", "vf-ma"], tags: ["pmr", "DEFAULT"] },
      "2026-12-17": { versions: ["vostfr-ma"], tags: ["DEFAULT"] }
    }}
  });
  expect(open.days.length === 2 && open.days[0].versions[0] === "vf-ma", "program dates/version normalize");
  expect(!!sentinelleDiff_(empty, open), "first appearance emits programming event");
  expect(!sentinelleDiff_(open, sentinelleNormalize_({
    "cinema-pathe-californie": { days: {
      "2026-12-16": { versions: ["vf-ma", "vostfr-ma"], tags: ["DEFAULT", "pmr"] },
      "2026-12-17": { versions: ["vostfr-ma"], tags: ["DEFAULT"] }
    }}
  })), "sorting should avoid false alerts");
  expect(sentinelleDiff_(open, sentinelleNormalize_({
    "cinema-pathe-californie": { days: {
      "2026-12-16": { versions: ["vostfr-ma"], tags: ["IMAX"] }
    }}
  })).removed.length === 1, "remove date detected");
  var bad = false;
  try { sentinelleNormalize_({ "cinema-pathe-californie": { days: "invalid" } }); }
  catch (_) { bad = true; }
  expect(bad, "bad schema rejected");
  expect(sentinelleDiff_(null, empty) === null, "empty baseline no false alert");
  // Word 'shows' is intentionally not referenced by the cinema-scoped parser.
  console.log("PASS: seven cinema-scoped parser fixtures");
  return true;
}
// ===== END tools/google_apps_script_sentinel.gs =====

// ===== BEGIN tools/google_apps_script_showtime_signal.gs =====
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

    var auditorium = typeof s.auditoriumName === "string" || typeof s.auditoriumName === "number"
      ? String(s.auditoriumName).slice(0, 40) : null;
    var capacity = /^\d{1,4}$/.test(String(s.auditoriumCapacity)) ? Number(s.auditoriumCapacity) : null;
    var proposed = s.status === "available" && link !== null && inWindow;
    // salesState is what the human is told. Anything that is neither clearly
    // open, clearly not-yet-open nor clearly over is UNCERTAIN and escalated:
    // e.g. sales window open but unknown status, or no recognised Pathé link.
    var salesState = proposed ? "OPEN"
      : start !== null && now < start ? "NOT_YET"
      : end !== null && now >= end ? "ENDED"
      : "UNCERTAIN";

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
      bookingProposedByApi: proposed, salesState: salesState,
      auditorium: auditorium, auditoriumCapacity: capacity,
      imaxByTag: tags.some(function(t) { return t.toLowerCase() === "imax"; }),
      imaxByAuditorium: auditorium !== null && /imax/i.test(auditorium),
      imaxLaserConfirmed: false, seatsKnown: false
    };
  }).sort(function(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
}
// ===== END tools/google_apps_script_showtime_signal.gs =====

// ===== BEGIN tools/google_apps_script_booking_monitor.gs =====
/**
 * Sentinelle Doomsday — detailed commercial-signal integration (candidate).
 *
 * Apps Script project MUST also include:
 * - tools/google_apps_script_sentinel.gs
 * - tools/google_apps_script_showtime_signal.gs
 *
 * No trigger is created here. Production runs it through sentinelleProductionTick().
 * Fail-open: unreadable content or newly listed sessions alert the human at once.
 *
 * The API signal is not a guarantee of seat inventory/checkout success.
 */
var DOOMSDAY_BOOKING_V1 = {
  film: "avengers-doomsday-55389",
  cinema: "cinema-pathe-californie",
  detailsPrefix: "DOOMSDAY_DETAIL_STATE_V1_",
  lastDetailOk: "DOOMSDAY_DETAIL_LAST_OK_V1",
  detailFailures: "DOOMSDAY_DETAIL_FAILURES_V1",
  // Independent backup probes: do not rely only on /cinemas for presales.
  // These dates are hypotheses until Doomsday's preprogramme endpoint is tested.
  anchorDates: ["2026-12-13", "2026-12-14", "2026-12-15",
    "2026-12-16", "2026-12-17", "2026-12-18", "2026-12-19", "2026-12-20"],
  maxDatesPerCheck: 20,
  detailBatchSize: 8,
  cursorKey: "DOOMSDAY_DETAIL_ROTATION_CURSOR_V1",
  partialKey: "DOOMSDAY_DETAIL_PARTIAL_NOTICE_V1",
  anomalyPrefix: "DOOMSDAY_DETAIL_ANOMALY_V1_",
  criticalKey: "DOOMSDAY_CRITICAL_REMINDER_V1",
  maxReminders: 12,              // one per cycle: about one hour at 5 minutes
  reminderMinGapMs: 4 * 60000,
  freshnessKey: "DOOMSDAY_DETAIL_FRESHNESS_V1",
  // Every candidate date must have had a healthy detailed read within this
  // window for the heartbeat to be sent while the calendar is rotated.
  maxDateAgeMinutes: 30
};

function sentinelleDetailedDates_(coreState, props) {
  // Do not silently stop monitoring when the premiere spans >20 dates.
  // Always probe known opening/preview anchors and rotate over additional
  // dates, under a strictly bounded request/time budget.
  var anchors=DOOMSDAY_BOOKING_V1.anchorDates.slice();
  var anchorSet={};
  anchors.forEach(function(d){anchorSet[d]=true;});
  var otherSet={};
  (coreState && Array.isArray(coreState.days) ? coreState.days : []).forEach(function(day){
    if (!day || typeof day.date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
      throw new Error("Unexpected cinema date");
    }
    if (!anchorSet[day.date]) otherSet[day.date]=true;
  });
  var extras=Object.keys(otherSet).sort();
  var slots=DOOMSDAY_BOOKING_V1.maxDatesPerCheck-anchors.length;
  if (slots<1) throw new Error("No monitoring capacity outside anchor dates");
  var selectedExtras=[];
  var cursor=props ? Number(props.getProperty(DOOMSDAY_BOOKING_V1.cursorKey)||"0") : 0;
  if (!isFinite(cursor) || cursor<0) cursor=0;
  cursor=Math.floor(cursor) % Math.max(extras.length,1);
  if (extras.length<=slots) selectedExtras=extras;
  else {
    for (var i=0;i<slots;i++) selectedExtras.push(extras[(cursor+i)%extras.length]);
    if (props) props.setProperty(DOOMSDAY_BOOKING_V1.cursorKey,
      String((cursor+slots)%extras.length));
  }
  var selected=anchors.concat(selectedExtras);
  selected.allDates=anchors.concat(extras);
  // Attach enumerable metadata for diagnostic/logging, not persisted as a list.
  selected.totalDates=anchors.length+extras.length;
  selected.skippedDates=Math.max(0,extras.length-selectedExtras.length);
  selected.coveragePartial=selected.skippedDates>0;
  return selected;
}

function sentinelleDetailedRequest_(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid detail date");
  var endpoint = "https://www.pathe.ma/api/show/" + DOOMSDAY_BOOKING_V1.film +
    "/showtimes/" + DOOMSDAY_BOOKING_V1.cinema + "/" + date;
  return {
    url: endpoint,
    muteHttpExceptions: true, followRedirects: true,
    validateHttpsCertificates: true,
    headers: { Accept: "application/json" }
  };
}

function sentinelleDetailedRead_(date, nowUtc, response) {
  var status = response.getResponseCode();
  // 404 is NOT proof of no tickets. It is unknown until schema/behavior
  // before programming is validated with a real target response.
  if (status === 404) return { date: date, kind: "UNKNOWN_404", sessions: null };
  if (status !== 200) throw new Error("Detailed showtime HTTP " + status);
  var body = response.getContentText();
  if (body.length > 300000) throw new Error("Oversized detailed response");
  var raw = JSON.parse(body);
  var signals;
  try {
    signals = patheShowtimeSignalsV1(raw, nowUtc);
  } catch (error) {
    // FAIL-OPEN: Pathé returned rows we cannot interpret. That is most likely
    // the opening itself under a new format: escalate to the human at once.
    if (Array.isArray(raw) && raw.length > 0) {
      return { date: date, kind: "ANOMALY", count: raw.length, sessions: null };
    }
    throw error;
  }
  // After-midnight shows may be listed under the previous day: keep them.
  return { date: date, kind: "VALID", sessions: signals };
}

function sentinelleDetailedSmallSnapshot_(signals) {
  // Only what the change detector needs. Alert text is built from live signals.
  var result = signals.map(function(s) {
    return { id: s.id, open: s.bookingProposedByApi === true,
      imax: s.imaxByTag === true || s.imaxByAuditorium === true,
      st: s.salesState === "UNCERTAIN" ? "U" : s.salesState === "NOT_YET" ? "N" : s.salesState === "ENDED" ? "E" : "O" };
  });
  // Script Properties cap a value at 9 KB: ~140 sessions for one date here.
  if (JSON.stringify(result).length > 8500) throw new Error("Detailed snapshot storage budget exhausted");
  return result;
}

function sentinelleDetailedChanges_(oldSnapshot, currentSnapshot) {
  var previous = {};
  (oldSnapshot || []).forEach(function(s) { previous[s.id] = s; });
  return currentSnapshot.filter(function(s) {
    return s.open && (!previous[s.id] || !previous[s.id].open ||
      (s.imax && !previous[s.id].imax));
  });
}

function sentinelleDetailedNewlyListed_(oldSnapshot, currentSnapshot) {
  var previous = {};
  (oldSnapshot || []).forEach(function(s) { previous[s.id] = s; });
  // New non-open sessions, plus any known session that has just become
  // UNCERTAIN (e.g. sales start passed but no recognised link appeared).
  return currentSnapshot.filter(function(s) {
    if (s.open || s.st === "E") return false;
    var before = previous[s.id];
    return !before || (s.st === "U" && before.st !== "U" && !before.open);
  });
}

function sentinelleCasablancaTime_(iso) {
  var ms = Date.parse(iso);
  if (!isFinite(ms)) return "inconnue";
  // Morocco is UTC+1 outside Ramadan (no Ramadan in December 2026).
  return new Date(ms + 3600000).toISOString().slice(0, 16).replace("T", " ") + " (heure de Casablanca)";
}

function sentinelleSessionLine_(s) {
  var room = s.auditorium ? " — salle " + s.auditorium +
    (s.auditoriumCapacity ? " (" + s.auditoriumCapacity + " places)" : "") : "";
  var imax = s.imaxByAuditorium ? " — 🎯 IMAX (Laser à confirmer sur la page de réservation)"
    : s.imaxByTag ? " — IMAX (Laser non confirmé)" : " — format à confirmer";
  return "- " + s.localTime.slice(0, 16) + " — " + s.version + room + imax;
}

function sentinelleDetailedAlert_(date, opened) {
  var lines = [
    "🚨 AVENGERS: DOOMSDAY — RÉSERVATION OUVERTE (API PATHÉ)",
    "Cinéma : Pathé Californie — Casablanca",
    "Date : " + date,
    "Attention : ce signal ne garantit pas de places encore disponibles ni un paiement réussi.",
    "IMAX Laser : non vérifié (un tag IMAX seul n'atteste pas Laser).",
    "Séances détectées :"
  ];
  opened.slice(0, 10).forEach(function(s) {
    lines.push(sentinelleSessionLine_(s));
    if (s.bookingUrl) lines.push("  Réserver : " + s.bookingUrl);
  });
  if (opened.length > 10) lines.push("… et " + (opened.length - 10) + " autres séances.");
  lines.push("Fiche officielle : " + DOOMSDAY_SENTINEL.publicPage);
  return {
    subject: "🚨 DOOMSDAY — réservation ouverte Pathé Californie " + date,
    body: lines.join("\n")
  };
}

function sentinelleUncertainAlert_(date, uncertain) {
  var lines = [
    "⚠️ AVENGERS: DOOMSDAY — SÉANCES PUBLIÉES, VENTE PEUT-ÊTRE OUVERTE",
    "Cinéma : Pathé Californie — Casablanca",
    "Date : " + date,
    "La fenêtre de vente n'est pas fermée, mais la sentinelle ne reconnaît pas le lien ou le statut de Pathé.",
    "VÉRIFIE MAINTENANT sur le site ou l'appli Pathé.",
    "Séances :"
  ];
  uncertain.slice(0, 10).forEach(function(s) {
    lines.push(sentinelleSessionLine_(s) + " — statut Pathé : " + String(s.status).slice(0, 30));
    if (s.bookingUrl) lines.push("  Lien : " + s.bookingUrl);
  });
  if (uncertain.length > 10) lines.push("… et " + (uncertain.length - 10) + " autres séances.");
  if (uncertain.some(function(s) { return s.linkUntrusted; })) {
    lines.push("Note : un lien hors domaine Pathé a été ignoré par sécurité. Passe par pathe.ma ou l'appli officielle.");
  }
  lines.push("Fiche officielle : " + DOOMSDAY_SENTINEL.publicPage);
  return { subject: "⚠️ DOOMSDAY — séances publiées, vente peut-être ouverte : vérifie MAINTENANT " + date,
    body: lines.join("\n") };
}

function sentinelleListedAlert_(date, listed) {
  var starts = listed.map(function(s) { return s.reservabilityStart; })
    .filter(function(x) { return !!x; }).sort();
  var lines = [
    "📅 AVENGERS: DOOMSDAY — SÉANCES PUBLIÉES À PATHÉ CALIFORNIE",
    "Date : " + date,
    "Ventes : pas encore ouvertes" + (starts.length ?
      " — ouverture annoncée par Pathé : " + sentinelleCasablancaTime_(starts[0]) : " — heure d'ouverture non communiquée"),
    "Séances :"
  ];
  listed.slice(0, 10).forEach(function(s) { lines.push(sentinelleSessionLine_(s)); });
  if (listed.length > 10) lines.push("… et " + (listed.length - 10) + " autres séances.");
  if (listed.some(function(s) { return s.linkUntrusted; })) {
    lines.push("Note : un lien hors domaine Pathé a été ignoré par sécurité.");
  }
  lines.push("Une alerte 🚨 suivra dès que la réservation sera proposée.");
  lines.push("Fiche officielle : " + DOOMSDAY_SENTINEL.publicPage);
  return { subject: "📅 DOOMSDAY — séances publiées Pathé Californie " + date, body: lines.join("\n") };
}

function sentinelleAnomalyAlert_(date, count) {
  return {
    subject: "⚠️ DOOMSDAY — contenu inattendu chez Pathé, vérifie MAINTENANT",
    body: "⚠️ AVENGERS: DOOMSDAY — Pathé Californie publie " + count + " élément(s) pour le " + date +
      " dans un format que la sentinelle ne sait pas lire.\n" +
      "C'est très probablement l'ouverture des séances : vérifie tout de suite à la main.\n" +
      DOOMSDAY_SENTINEL.publicPage
  };
}

/** Records the last healthy read per date and returns the coverage age. */
function sentinelleDateFreshness_(props, allDates, goodDates, nowIso) {
  var nowMs = Date.parse(nowIso);
  var stored = {};
  try { stored = sentinelleReadJsonProperty_(props, DOOMSDAY_BOOKING_V1.freshnessKey, {}) || {}; }
  catch (_) { stored = {}; }
  var kept = {};
  allDates.forEach(function(d) { if (typeof stored[d] === "number") kept[d] = stored[d]; });
  goodDates.forEach(function(d) { kept[d] = nowMs; });
  props.setProperty(DOOMSDAY_BOOKING_V1.freshnessKey, JSON.stringify(kept));
  var oldest = 0, never = false, stale = 0;
  allDates.forEach(function(d) {
    if (typeof kept[d] !== "number") { never = true; stale++; return; }
    var age = (nowMs - kept[d]) / 60000;
    if (age > DOOMSDAY_BOOKING_V1.maxDateAgeMinutes) stale++;
    if (age > oldest) oldest = age;
  });
  return { oldestAgeMinutes: never ? null : Math.round(oldest * 10) / 10, stale: stale };
}

/* ---- Insistent reminder for critical alerts (opening / anomaly) ---- */

function sentinelleTelegramApi_(props, method, payload) {
  var token = props.getProperty(DOOMSDAY_SENTINEL.secretBot);
  if (!token) throw new Error("Telegram not configured");
  var r = UrlFetchApp.fetch("https://api.telegram.org/bot" + encodeURIComponent(token) + "/" + method, {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });
  var data;
  try { data = JSON.parse(r.getContentText()); } catch (_) { data = null; }
  if (r.getResponseCode() !== 200 || !data || data.ok !== true) throw new Error("Telegram " + method + " rejected");
  return data.result;
}

function sentinelleArmCritical_(props, nowIso, summary) {
  props.setProperty(DOOMSDAY_BOOKING_V1.criticalKey, JSON.stringify({
    nonce: new Date().getTime().toString(36) + Math.random().toString(36).slice(2, 8),
    armedAt: nowIso, summary: summary.slice(0, 700), sent: 0, acked: false
  }));
}

/** Re-sends the critical alert on Telegram each cycle until the user taps "J'ai vu" or replies. */
function sentinelleCriticalReminderTick_(props, nowIso) {
  var rec = sentinelleReadJsonProperty_(props, DOOMSDAY_BOOKING_V1.criticalKey, null);
  if (!rec || rec.acked) return "NONE";
  if (rec.sent >= DOOMSDAY_BOOKING_V1.maxReminders) return "EXHAUSTED";
  var now = Date.parse(nowIso), armed = Date.parse(rec.armedAt);
  if (!isFinite(now) || !isFinite(armed)) return "INVALID";
  if (now - armed < DOOMSDAY_BOOKING_V1.reminderMinGapMs * (rec.sent + 1)) return "WAITING";
  var chat = String(props.getProperty(DOOMSDAY_SENTINEL.secretChat) || "");
  try {
    var updates = sentinelleTelegramApi_(props, "getUpdates", { limit: 100, timeout: 0 });
    (Array.isArray(updates) ? updates : []).some(function(u) {
      var q = u && u.callback_query, m = u && u.message;
      var tapped = q && q.data === "seen:" + rec.nonce && q.from && String(q.from.id) === chat;
      var replied = m && m.chat && String(m.chat.id) === chat && typeof m.text === "string" &&
        Number(m.date) * 1000 >= armed;
      if (!tapped && !replied) return false;
      rec.acked = true; rec.ackedAt = nowIso;
      if (tapped) {
        try { sentinelleTelegramApi_(props, "answerCallbackQuery",
          { callback_query_id: q.id, text: "OK, rappels arrêtés." }); } catch (_) {}
      }
      return true;
    });
  } catch (_) { /* cannot read acks: keep reminding, never block the cycle */ }
  if (!rec.acked) {
    try {
      sentinelleTelegramApi_(props, "sendMessage", {
        chat_id: chat, disable_web_page_preview: true,
        text: "🔁 RAPPEL " + (rec.sent + 1) + "/" + DOOMSDAY_BOOKING_V1.maxReminders + "\n" + rec.summary +
          "\n\nAppuie sur « J'ai vu » (ou réponds n'importe quoi) pour arrêter les rappels.",
        reply_markup: { inline_keyboard: [[{ text: "✅ J'ai vu", callback_data: "seen:" + rec.nonce }]] }
      });
      rec.sent++;
    } catch (_) {}
  }
  props.setProperty(DOOMSDAY_BOOKING_V1.criticalKey, JSON.stringify(rec));
  return rec.acked ? "ACKNOWLEDGED" : "REMINDED";
}

/**
 * Official MANUAL entry point; no trigger created.
 * Independently evaluates detailed sale windows on EVERY call, including
 * before /cinemas has any scheduled day, via configured anchor dates.
 */
function sentinelleCheckWithBookingOnce(nowUtc) {
  var now = nowUtc || new Date().toISOString();
  var coreError = null, coreSummary = null;
  // Reuse existing programme detector, queue and health logic.
  // Even when /cinemas fails, continue checking the detailed endpoints.
  try { coreSummary = sentinelleCheckOnce(); }
  catch (err) { coreError = String(err.name || "Error"); }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) throw new Error("Detailed monitor is busy");
  var props = PropertiesService.getScriptProperties();
  try {
    var baseline = sentinelleReadJsonProperty_(props, DOOMSDAY_SENTINEL.stateKey, null);
    var dates = sentinelleDetailedDates_(baseline, props);
    var good = 0, unknown = 0, failures = 0, newlyOpen = 0, newlyListed = 0, anomalies = 0;
    var goodDates = [];
    if (dates.coveragePartial && props.getProperty(DOOMSDAY_BOOKING_V1.partialKey)!=="reported") {
      sentinelleEnqueue_(props, "⚠️ [DOOMSDAY] Couverture partielle par rotation",
        "Programmation étendue : "+dates.totalDates+" dates, "+dates.length+
        " contrôlées par cycle. Dates restantes couvertes aux passages suivants."+
        "\nAlerte de couverture (pas un signal de vente).\n"+DOOMSDAY_SENTINEL.publicPage);
      props.setProperty(DOOMSDAY_BOOKING_V1.partialKey,"reported");
    }
    if (!dates.coveragePartial && props.getProperty(DOOMSDAY_BOOKING_V1.partialKey)==="reported") {
      props.setProperty(DOOMSDAY_BOOKING_V1.partialKey,"");
    }
    var errors = [];
    for (var offset = 0; offset < dates.length; offset += DOOMSDAY_BOOKING_V1.detailBatchSize) {
      var batch = dates.slice(offset, offset + DOOMSDAY_BOOKING_V1.detailBatchSize);
      var responses;
      try {
        responses = UrlFetchApp.fetchAll(batch.map(sentinelleDetailedRequest_));
        if (!Array.isArray(responses) || responses.length !== batch.length) {
          throw new Error("Unexpected detail batch response count");
        }
      } catch (_) {
        // Do not retry the entire batch serially within the same cycle.
        failures += batch.length;
        batch.forEach(function(date) { errors.push({ date: date, errorType: "DetailBatchFetchError" }); });
        continue;
      }
      batch.forEach(function(date, index) {
        try {
          var detail = sentinelleDetailedRead_(date, now, responses[index]);
          var anomalyKey = DOOMSDAY_BOOKING_V1.anomalyPrefix + date;
          if (detail.kind === "ANOMALY") {
            unknown++; anomalies++;
            if (props.getProperty(anomalyKey) !== "reported") {
              var a = sentinelleAnomalyAlert_(date, detail.count);
              sentinelleEnqueue_(props, a.subject, a.body);
              sentinelleArmCritical_(props, now, a.body);
              props.setProperty(anomalyKey, "reported");
            }
            return; // Preserve previously healthy snapshot.
          }
          if (detail.kind !== "VALID") {
            unknown++;
            return; // Preserve previously healthy snapshot.
          }
          if (props.getProperty(anomalyKey) === "reported") props.setProperty(anomalyKey, "");
          var key = DOOMSDAY_BOOKING_V1.detailsPrefix + date;
          var old = sentinelleReadJsonProperty_(props, key, null);
          if (old !== null && !Array.isArray(old)) throw new Error("Invalid old details snapshot");
          var current = sentinelleDetailedSmallSnapshot_(detail.sessions);
          var byId = {};
          detail.sessions.forEach(function(s) { byId[s.id] = s; });
          var live = function(x) { return byId[x.id]; };
          var newSales = sentinelleDetailedChanges_(old, current).map(live);
          var newlyListedAll = sentinelleDetailedNewlyListed_(old, current).map(live);
          var uncertain = newlyListedAll.filter(function(s) { return s.salesState === "UNCERTAIN"; });
          var listed = newlyListedAll.filter(function(s) { return s.salesState === "NOT_YET"; });
          if (newSales.length) {
            var alert = sentinelleDetailedAlert_(date, newSales);
            sentinelleEnqueue_(props, alert.subject, alert.body);
            sentinelleArmCritical_(props, now, alert.body);
            newlyOpen += newSales.length;
          }
          if (uncertain.length) {
            var warn = sentinelleUncertainAlert_(date, uncertain);
            sentinelleEnqueue_(props, warn.subject, warn.body);
            sentinelleArmCritical_(props, now, warn.body);
            newlyListed += uncertain.length;
          }
          if (listed.length) {
            var notice = sentinelleListedAlert_(date, listed);
            sentinelleEnqueue_(props, notice.subject, notice.body);
            newlyListed += listed.length;
          }
          // After enqueue, never before; any pending channel will be retried.
          props.setProperty(key, JSON.stringify(current));
          good++; goodDates.push(date);
        } catch (error) {
          failures++;
          // Do not disclose details/credentials/response bodies in logs.
          errors.push({ date: date, errorType: String(error.name || "Error") });
        }
      });
    }
    if (good === dates.length && failures === 0 && unknown === 0) {
      props.setProperty(DOOMSDAY_BOOKING_V1.lastDetailOk, new Date().toISOString());
      props.setProperty(DOOMSDAY_BOOKING_V1.detailFailures, "0");
    } else {
      var consecutive = Number(props.getProperty(DOOMSDAY_BOOKING_V1.detailFailures) || "0") + 1;
      props.setProperty(DOOMSDAY_BOOKING_V1.detailFailures, String(consecutive));
      if (consecutive === 3 || (consecutive >= 12 && consecutive % 12 === 0)) {
        sentinelleEnqueue_(props, "⚠️ [DOOMSDAY] Couverture billetterie dégradée",
          "Impossible de confirmer la lecture détaillée de toutes les séances depuis " +
          consecutive + " contrôles.\nDernière lecture détaillée saine : " +
          (props.getProperty(DOOMSDAY_BOOKING_V1.lastDetailOk) || "aucune") +
          "\nExaminer immédiatement : " + DOOMSDAY_SENTINEL.publicPage);
      }
    }
    var freshness = sentinelleDateFreshness_(props, dates.allDates, goodDates, now);
    var sent = sentinelleFlushOutbox_(props);
    var reminder;
    try { reminder = sentinelleCriticalReminderTick_(props, now); }
    catch (_) { reminder = "ERROR"; }
    var report = {
      checkedAtUtc: now,
      cinemaProgramme: coreSummary ? coreSummary.status : "CORE_ERROR",
      coreErrorType: coreError,
      datesChecked: dates.length,
      totalCandidateDates: dates.totalDates,
      datesNotCheckedThisCycle: dates.skippedDates,
      partialDateCoverage: dates.coveragePartial,
      // Age of the least recently verified candidate date; null if any date
      // has never been read successfully. Shows what "healthy" really covers.
      oldestDateCheckAgeMinutes: freshness.oldestAgeMinutes,
      staleDates: freshness.stale,
      validDetailedDays: good,
      unknownDetailedDays: unknown,
      failedDetailedDays: failures,
      newReservableSessions: newlyOpen,
      newlyListedSessions: newlyListed,
      anomalyDetailedDays: anomalies,
      criticalReminder: reminder,
      delivery: sent,
      errors: errors
    };
    console.log(JSON.stringify(report));
    return report;
  } finally {
    lock.releaseLock();
  }
}
// ===== END tools/google_apps_script_booking_monitor.gs =====

// ===== BEGIN tools/google_apps_script_watchdog.gs =====
/**
 * Optional Healthchecks.io success-heartbeat wrapper. Not scheduled or deployed
 * by this file. Store private UUID URL in Script Property HC_PING_URL.
 * Spec: https://healthchecks.io/docs/http_api/
 * Never pings in finally: an incomplete cycle must not report health.
 */
function sentinelleHealthyForWatchdog_(r) {
  return !!r &&
    (r.cinemaProgramme==="NO_PROGRAMME_FOR_CINEMA" || r.cinemaProgramme==="DATES_PROGRAMMED") &&
    r.coreErrorType===null &&
    Number.isInteger(r.datesChecked) && r.datesChecked>0 &&
    r.validDetailedDays===r.datesChecked &&
    r.unknownDetailedDays===0 && r.failedDetailedDays===0 &&
    // Rotation over >20 dates: "healthy" means EVERY candidate date had a
    // healthy read within maxDateAgeMinutes (not just this cycle's subset).
    (r.datesNotCheckedThisCycle===0 ||
      (typeof r.oldestDateCheckAgeMinutes==="number" &&
       r.oldestDateCheckAgeMinutes<=(typeof DOOMSDAY_BOOKING_V1==="object" ?
        DOOMSDAY_BOOKING_V1.maxDateAgeMinutes : 30))) &&
    !!r.delivery && r.delivery.pending===0;
}
function sentinelleWatchdogError_(reason, httpStatus) {
  var diagnostic = { watchdog: "FAILED", reason: reason };
  if (httpStatus != null) diagnostic.httpStatus = httpStatus;
  console.log(JSON.stringify(diagnostic));
  var error = new Error("Healthchecks heartbeat failed: " + reason);
  error.name = "WatchdogError";
  return error;
}

function sentinelleWatchdogSuccessPing_() {
  var url=PropertiesService.getScriptProperties().getProperty("HC_PING_URL");
  if (!url || !/^https:\/\/hc-ping\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url)) {
    throw sentinelleWatchdogError_("NOT_CONFIGURED");
  }
  var response;
  try {
    response=UrlFetchApp.fetch(url,{
      method:"get",muteHttpExceptions:true,followRedirects:false,
      validateHttpsCertificates:true
    });
  } catch (_) {
    throw sentinelleWatchdogError_("TRANSPORT_ERROR");
  }
  var status;
  var acknowledgement;
  try {
    status = response.getResponseCode();
    if (status === 200) acknowledgement = response.getContentText().trim();
  } catch (_) {
    throw sentinelleWatchdogError_("RESPONSE_READ_ERROR");
  }
  if (status !== 200) {
    var safeStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
    throw sentinelleWatchdogError_("HTTP_ERROR", safeStatus);
  }
  if (acknowledgement === "OK (not found)") throw sentinelleWatchdogError_("CHECK_NOT_FOUND");
  if (acknowledgement === "OK (rate limited)") throw sentinelleWatchdogError_("RATE_LIMITED");
  if (acknowledgement !== "OK") throw sentinelleWatchdogError_("UNEXPECTED_ACK");
  return true;
}
function sentinelleRunWithWatchdog() {
  var report;
  try { report=sentinelleCheckWithBookingOnce(); }
  catch (_) { throw new Error("Sentinel execution failed; watchdog not pinged"); }
  if(!sentinelleHealthyForWatchdog_(report)) {
    console.log(JSON.stringify({watchdog:"WITHHELD",reason:"INCOMPLETE_OR_DEGRADED_CYCLE"}));
    return {report:report,watchdog:"WITHHELD"};
  }
  sentinelleWatchdogSuccessPing_();
  console.log(JSON.stringify({watchdog:"ACKNOWLEDGED"}));
  return {report:report,watchdog:"ACKNOWLEDGED"};
}
// ===== END tools/google_apps_script_watchdog.gs =====

// ===== BEGIN tools/google_apps_script_pilot_metrics.gs =====
/**
 * Bounded instrumentation only. This file creates NO trigger.
 * Manual check does NOT ping Healthchecks or change its paused state.
 * Future pilot entry point pings only through the existing healthy-cycle wrapper.
 */
var DOOMSDAY_METRICS_V1={prefix:"DOOMSDAY_METRICS_V1_",chunkSize:48,chunks:6};
function sentinelleMetricsRecord_(props,sample) {
  var cfg=DOOMSDAY_METRICS_V1;
  var raw=props.getProperty(cfg.prefix+"COUNT");
  var count=raw===null?0:Number(raw);
  if(!Number.isSafeInteger(count)||count<0)throw new Error("Metrics count invalid");
  var index=Math.floor(count/cfg.chunkSize)%cfg.chunks;
  var offset=count%cfg.chunkSize,key=cfg.prefix+"CHUNK_"+index;
  var rows=JSON.parse(props.getProperty(key)||"[]");
  var expected=count>=cfg.chunkSize*cfg.chunks?cfg.chunkSize:offset;
  if(!Array.isArray(rows)||rows.length!==expected)throw new Error("Metrics chunk invalid");
  rows[offset]=sample;
  var text=JSON.stringify(rows);
  if(text.length>7000)throw new Error("Metrics chunk storage limit");
  // Both changes are recoverable observational data, not alert delivery state.
  props.setProperty(key,text);
  props.setProperty(cfg.prefix+"COUNT",String(count+1));
}
function sentinelleMetricsSummary_(props,nowMs) {
  var cfg=DOOMSDAY_METRICS_V1,rows=[],raw=props.getProperty(cfg.prefix+"COUNT");
  var count=raw===null?0:Number(raw);
  if(!Number.isSafeInteger(count)||count<0)throw new Error("Metrics count invalid");
  for(var i=0;i<cfg.chunks;i++){
    var chunk=props.getProperty(cfg.prefix+"CHUNK_"+i);
    if(chunk===null)continue;
    var parsed=JSON.parse(chunk);
    if(!Array.isArray(parsed)||parsed.length>cfg.chunkSize)throw new Error("Metrics chunk invalid");
    rows=rows.concat(parsed);
  }
  rows=rows.filter(function(r){return r.t>=nowMs-86400000 && r.t<=nowMs;})
    .sort(function(a,b){return a.t-b.t;});
  var durations=rows.map(function(r){return r.ms;}).sort(function(a,b){return a-b;});
  var total=durations.reduce(function(a,b){return a+b;},0),healthy=0,maxGap=0;
  rows.forEach(function(r,i){if(r.h)healthy++;if(i)maxGap=Math.max(maxGap,r.t-rows[i-1].t);});
  var p95=durations.length?durations[Math.ceil(durations.length*0.95)-1]:null;
  return {samplesInLast24h:rows.length,totalSamplesRecorded:count,
    retainedCapacity:cfg.chunkSize*cfg.chunks,
    firstSampleUtc:rows.length?new Date(rows[0].t).toISOString():null,
    lastSampleUtc:rows.length?new Date(rows[rows.length-1].t).toISOString():null,
    observedSpanMinutes:rows.length?(rows[rows.length-1].t-rows[0].t)/60000:0,
    healthySamples:healthy,degradedOrFailedSamples:rows.length-healthy,
    totalRuntimeSeconds:total/1000,p95DurationMs:p95,
    maxDurationMs:durations.length?durations[durations.length-1]:null,
    maxObservedGapSeconds:rows.length>1?maxGap/1000:null,
    warning:"Manual samples are not proof of a running 24-hour trigger; retained samples are bounded."};
}
function sentinelleInstrumentedRun_(runner) {
  // Separate lock: the detector itself acquires the script lock.
  var lock=LockService.getUserLock();
  if(!lock.tryLock(1000))throw new Error("Instrumented run already active");
  var start=Date.now(),r=null,error=null;
  try {
    try {r=runner();}catch(e){error=String(e.name||"Error");}
    var report=r&&r.report?r.report:r;
    var sample={t:start,ms:Date.now()-start,h:!error&&sentinelleHealthyForWatchdog_(report)?1:0,
      d:report&&Number.isInteger(report.datesChecked)?report.datesChecked:0,
      f:report&&Number.isInteger(report.failedDetailedDays)?report.failedDetailedDays:0,
      u:report&&Number.isInteger(report.unknownDetailedDays)?report.unknownDetailedDays:0,
      p:report&&report.delivery?Number(report.delivery.pending||0):0,e:error};
    sentinelleMetricsRecord_(PropertiesService.getScriptProperties(),sample);
    console.log(JSON.stringify({instrumented:true,sample:sample,
      watchdog:r&&r.watchdog?r.watchdog:"NOT_SENT_MANUAL_CHECK"}));
    if(error)throw new Error("Instrumented check failed; sample recorded");
    return r;
  }finally{lock.releaseLock();}
}
/** Safe manual readiness measurement: no heartbeat, no trigger creation. */
function sentinelleInstrumentedCheckOnce() {
  return sentinelleInstrumentedRun_(function(){return sentinelleCheckWithBookingOnce();});
}
/** Candidate for a future explicitly installed pilot trigger. Not run automatically. */
function sentinelleInstrumentedPilotCycle() {
  var props=PropertiesService.getScriptProperties();
  var raw=props.getProperty("DOOMSDAY_PILOT_WINDOW_V1");
  if(!raw)throw new Error("Pilot window not prepared");
  var window=JSON.parse(raw),now=Date.now();
  if(window.status==="PREPARED") {
    window.status="RUNNING";window.startedAtUtc=new Date(now).toISOString();
    window.endsAtUtc=new Date(now+86400000).toISOString();
    window.baselineCount=Number(props.getProperty(DOOMSDAY_METRICS_V1.prefix+"COUNT")||"0");
    props.setProperty("DOOMSDAY_PILOT_WINDOW_V1",JSON.stringify(window));
  }
  if(window.status!=="RUNNING"&&window.status!=="EXPIRED")throw new Error("Pilot window invalid");
  var end=Date.parse(window.endsAtUtc);
  if(!isFinite(end))throw new Error("Pilot end invalid");
  if(now>=end) {
    if(window.status==="RUNNING") {
      sentinelleEnqueue_(props,"[DOOMSDAY] Pilote 24 h terminé",
        "La fenêtre de collecte du pilote est terminée. Les lectures Pathé et heartbeats sont arrêtés."+
        "\nRevoir les métriques, supprimer le déclencheur et mettre Healthchecks en pause."+
        "\nUne alerte DOWN après cette fin programmée correspond à cet arrêt attendu, pas à une panne Pathé.");
      window.status="EXPIRED";
      props.setProperty("DOOMSDAY_PILOT_WINDOW_V1",JSON.stringify(window));
    }
    var delivery=sentinelleFlushOutbox_(props);
    console.log(JSON.stringify({pilot:"EXPIRED",endsAtUtc:window.endsAtUtc,delivery:delivery}));
    return {pilot:"EXPIRED",delivery:delivery};
  }
  if(window.status!=="RUNNING")throw new Error("Expired pilot cannot restart");
  return sentinelleInstrumentedRun_(function(){return sentinelleRunWithWatchdog();});
}
/** Prepare only; no trigger or heartbeat created. First pilot cycle starts the clock. */
function sentinellePreparePilot24h() {
  var props=PropertiesService.getScriptProperties();
  var receipt=JSON.parse(props.getProperty("DOOMSDAY_RECEIPT_TEST_V1")||"null");
  if(!receipt||receipt.acknowledged!==true)throw new Error("Telegram recipient acknowledgement required");
  var old=JSON.parse(props.getProperty("DOOMSDAY_PILOT_WINDOW_V1")||"null");
  if(old)throw new Error("Pilot window already exists; review before replacement");
  var result=sentinelleInstrumentedCheckOnce();
  if(!sentinelleHealthyForWatchdog_(result))throw new Error("Pilot preflight degraded");
  var window={status:"PREPARED",preparedAtUtc:new Date().toISOString(),
    startedAtUtc:null,endsAtUtc:null,baselineCount:null};
  props.setProperty("DOOMSDAY_PILOT_WINDOW_V1",JSON.stringify(window));
  console.log(JSON.stringify({pilot:window,triggerCreated:false,heartbeatSent:false}));
  return window;
}
function sentinellePilotWindowStatus() {
  var raw=PropertiesService.getScriptProperties().getProperty("DOOMSDAY_PILOT_WINDOW_V1");
  var result=raw?JSON.parse(raw):null;
  console.log(JSON.stringify({pilot:result}));return result;
}
function sentinellePilotMetrics() {
  var result=sentinelleMetricsSummary_(PropertiesService.getScriptProperties(),Date.now());
  console.log(JSON.stringify(result));return result;
}
// ===== END tools/google_apps_script_pilot_metrics.gs =====

// ===== BEGIN tools/google_apps_script_production.gs =====
/**
 * Sentinelle Doomsday — permanent monitor entry point.
 *
 * Production is OFF until private Script Property
 * DOOMSDAY_PRODUCTION_ENABLED = true.
 *
 * Designed for ONE 5-minute time-driven trigger on sentinelleProductionTick.
 * Never use sentinelleInstrumentedPilotCycle for permanent monitoring: its
 * 24-hour window is expired by design.
 *
 * This file contains NO secrets. It creates NO trigger. The only trigger it
 * ever touches is its own: at the optional end date it deletes the
 * sentinelleProductionTick triggers of the account running it (closeout).
 */
var DOOMSDAY_PRODUCTION_V1 = {
  enableKey: "DOOMSDAY_PRODUCTION_ENABLED",
  untilKey: "DOOMSDAY_PRODUCTION_UNTIL",
  closeoutKey: "DOOMSDAY_PRODUCTION_CLOSEOUT_V1",
  lastAutoRunKey: "DOOMSDAY_LAST_AUTOMATIC_RUN_V1",
  closeoutMaxHours: 24,
  version: "production-v1.3-audit-20261120"
};

/**
 * Scheduler entry point. Returns a no-op if explicitly disabled.
 * Uses the already-tested booking + independent watchdog + metrics pipeline.
 * `e` is the time-driven trigger event (e.triggerUid) when run automatically.
 */
function sentinelleProductionTick(e) {
  var props=PropertiesService.getScriptProperties();
  if (props.getProperty(DOOMSDAY_PRODUCTION_V1.enableKey) !== "true") {
    var skipped={mode:"PRODUCTION",status:"DISABLED",triggerCreated:false};
    console.log(JSON.stringify(skipped));
    return skipped;
  }
  var until=Date.parse(props.getProperty(DOOMSDAY_PRODUCTION_V1.untilKey)||"");
  if (isFinite(until) && Date.now()>=until) return sentinelleProductionCloseout_(props, until);
  // Reuses bounded telemetry, locks and channel retry behavior.
  var result = sentinelleInstrumentedRun_(function(){
    return sentinelleRunWithWatchdog();
  });
  sentinelleRecordAutomaticRun_(props, e, result);
  return result;
}

/**
 * Evidence of WHO really runs the trigger: only an automatic execution (event
 * carrying triggerUid) is recorded, with the identity of the trigger owner.
 */
function sentinelleRecordAutomaticRun_(props, e, result) {
  if (!e || e.triggerUid === undefined || e.triggerUid === null) return;
  var identity=null, fingerprint=null;
  try { identity = Session.getEffectiveUser().getEmail() || null; } catch (_) {}
  try { fingerprint = typeof sentinelleCodeFingerprint_ === "function" ? sentinelleCodeFingerprint_() : null; } catch (_) {}
  props.setProperty(DOOMSDAY_PRODUCTION_V1.lastAutoRunKey, JSON.stringify({
    atUtc: new Date().toISOString(), triggerUid: String(e.triggerUid), identity: identity,
    version: DOOMSDAY_PRODUCTION_V1.version, fingerprint: fingerprint,
    watchdog: result && result.watchdog ? result.watchdog : null
  }));
}

/**
 * End of service, in idempotent phases (re-run on every cycle until complete):
 *  1. the 🛑 notice is CREATED once (outbox), then its delivery is retried;
 *  2. Healthchecks is paused via the API when HC_API_KEY is set (retried);
 *  3. this account's sentinelleProductionTick triggers are deleted only once
 *     the notice is delivered on every channel, or after closeoutMaxHours
 *     (so a dead channel cannot keep the trigger alive forever).
 * Status CLOSEOUT_INCOMPLETE until 3 succeeds; then CLOSED_OUT, and later
 * calls are a silent no-op. Pathé is never read after the end date.
 * Manual recovery: run sentinelleProductionTick() from the editor.
 */
function sentinelleProductionCloseout_(props, until) {
  var untilIso=new Date(until).toISOString();
  var rec=null;
  try { rec=JSON.parse(props.getProperty(DOOMSDAY_PRODUCTION_V1.closeoutKey)||"null"); } catch (_) { rec=null; }
  if (rec && rec.status==="CLOSED_OUT") {
    var expired={mode:"PRODUCTION",status:"EXPIRED",until:untilIso};
    console.log(JSON.stringify(expired));
    return expired;
  }
  var nowMs=Date.now();
  if (!rec) {
    var paused=sentinelleHealthchecksPause_(props);
    sentinelleEnqueue_(props,"🛑 [DOOMSDAY] Sentinelle arrêtée (date de fin atteinte)",
      "Fin de service programmée atteinte : " + untilIso + ".\nPathé n'est plus surveillé.\n" +
      (paused ? "Healthchecks a été mis en pause automatiquement." :
        "Mets le check Healthchecks en pause : une alerte DOWN qui suivrait correspond à cet arrêt prévu, pas à une panne.") +
      "\nPour relancer : supprimer DOOMSDAY_PRODUCTION_CLOSEOUT_V1, repousser DOOMSDAY_PRODUCTION_UNTIL et recréer le déclencheur.");
    rec={startedAtUtc:new Date(nowMs).toISOString(),attempts:0,healthchecksPaused:paused};
  } else if (!rec.healthchecksPaused && props.getProperty("HC_API_KEY")) {
    rec.healthchecksPaused=sentinelleHealthchecksPause_(props);
  }
  rec.attempts=(rec.attempts||0)+1;
  var delivery;
  try { delivery=sentinelleFlushOutbox_(props); } catch (_) { delivery={pending:-1}; }
  rec.pendingNotifications=delivery.pending;
  var deadline=Date.parse(rec.startedAtUtc)+DOOMSDAY_PRODUCTION_V1.closeoutMaxHours*3600000;
  var mayDelete=delivery.pending===0 || nowMs>=deadline;
  var remaining=null;
  if (mayDelete) {
    try {
      ScriptApp.getProjectTriggers().forEach(function(t) {
        if (t.getHandlerFunction()==="sentinelleProductionTick") ScriptApp.deleteTrigger(t);
      });
      remaining=ScriptApp.getProjectTriggers().filter(function(t) {
        return t.getHandlerFunction()==="sentinelleProductionTick";
      }).length;
    } catch (_) { remaining=null; }
  }
  rec.triggersRemaining=remaining;
  rec.status=remaining===0 ? "CLOSED_OUT" : "CLOSEOUT_INCOMPLETE";
  rec.reason=remaining===0 ? (delivery.pending===0 ? "COMPLETE" : "DEADLINE_NOTICE_UNDELIVERED")
    : !mayDelete ? "WAITING_NOTICE_DELIVERY" : "TRIGGER_DELETION_FAILED";
  rec.lastAttemptUtc=new Date(nowMs).toISOString();
  rec.until=untilIso;
  props.setProperty(DOOMSDAY_PRODUCTION_V1.closeoutKey, JSON.stringify(rec));
  var out={mode:"PRODUCTION",status:rec.status,reason:rec.reason,until:untilIso,
    healthchecksPaused:rec.healthchecksPaused,triggersRemaining:remaining,delivery:delivery};
  console.log(JSON.stringify(out));
  return out;
}

/** Optional: pauses the check via the Healthchecks management API (key in HC_API_KEY). */
function sentinelleHealthchecksPause_(props) {
  var key=props.getProperty("HC_API_KEY");
  var m=/^https:\/\/hc-ping\.com\/([0-9a-f-]{36})$/i.exec(props.getProperty("HC_PING_URL")||"");
  if (!key || !m) return false;
  try {
    var r=UrlFetchApp.fetch("https://healthchecks.io/api/v3/checks/"+m[1]+"/pause",{
      method:"post",headers:{"X-Api-Key":key},muteHttpExceptions:true,followRedirects:false});
    return r.getResponseCode()===200;
  } catch (_) { return false; }
}

/** Read-only status, no test fetch, notification or heartbeat. */
function sentinelleProductionStatus() {
  var props=PropertiesService.getScriptProperties();
  var enabled=props.getProperty(DOOMSDAY_PRODUCTION_V1.enableKey)==="true";
  var coreLast=props.getProperty(DOOMSDAY_SENTINEL.lastOkKey);
  var detailLast=props.getProperty(DOOMSDAY_BOOKING_V1.lastDetailOk);
  var result={mode:"PRODUCTION",version:DOOMSDAY_PRODUCTION_V1.version,
    enabled:enabled,coreLastOkUtc:coreLast||null,detailLastOkUtc:detailLast||null};
  console.log(JSON.stringify(result));
  return result;
}
// ===== END tools/google_apps_script_production.gs =====

// ===== BEGIN tools/google_apps_script_deploy_check.gs =====
/**
 * Sentinelle Doomsday — read-only deployment report (expert audit 2026-11-20).
 *
 * Run MANUALLY from the Apps Script editor before and after enabling production.
 * It fetches nothing from Pathé, sends no notification, pings no watchdog and
 * creates/deletes no trigger. It prints NO secret value (only presence flags).
 *
 * Proves, from inside the real project:
 *  - which code is installed: SHA-256 over the source of EVERY function and
 *    configuration object of the 7 production files, compared with the value
 *    CI computes from the commit (tests/test_google_apps_script_deploy_check.js);
 *  - who really runs the trigger: identity + triggerUid recorded by the last
 *    AUTOMATIC execution, cross-checked with this account's own triggers
 *    (a manual run alone only proves who is clicking);
 *  - that exactly ONE time-driven trigger targets sentinelleProductionTick and
 *    that no expired pilot trigger remains;
 *  - that secrets and the production lock are configured;
 *  - runtime consumed over the last 24 h (from the bounded cycle metrics).
 *
 * Note: Apps Script exposes no API for the remaining daily trigger quota.
 * The 24 h runtime below covers THIS project only; other projects owned by the
 * same Google account consume the same 90 min/day budget.
 */
var DOOMSDAY_DEPLOY_EXPECTED = {
  productionVersion: "production-v1.3-audit-20261120",
  files: ["sentinel", "showtime_signal", "booking_monitor", "watchdog",
    "pilot_metrics", "production", "deploy_check"],
  // Generated by CI check: must list every top-level function of the 7 files.
  fingerprintFunctions: [
    "sentinellePlainObject_", "sentinelleUniqueStrings_", "sentinelleNormalize_",
    "sentinelleDiff_", "sentinelleFormatDay_", "sentinelleEventMessage_",
    "sentinelleReadJsonProperty_", "sentinelleCheckOnce", "sentinelleEnqueue_",
    "sentinelleTelegramText_", "sentinelleSendTelegram_", "sentinelleSendMail_",
    "sentinelleFlushOutbox_", "sentinelleTestNotifications", "sentinelleConfigCheck",
    "testSentinelleParserFixture", "patheParseInstant_", "patheTrustedBookingUrl_",
    "patheShowtimeSignalsV1", "sentinelleDetailedDates_", "sentinelleDetailedRequest_",
    "sentinelleDetailedRead_", "sentinelleDetailedSmallSnapshot_", "sentinelleDetailedChanges_",
    "sentinelleDetailedNewlyListed_", "sentinelleCasablancaTime_", "sentinelleSessionLine_",
    "sentinelleDetailedAlert_", "sentinelleUncertainAlert_", "sentinelleListedAlert_",
    "sentinelleAnomalyAlert_", "sentinelleDateFreshness_", "sentinelleTelegramApi_",
    "sentinelleArmCritical_", "sentinelleCriticalReminderTick_",
    "sentinelleCheckWithBookingOnce", "sentinelleHealthyForWatchdog_",
    "sentinelleWatchdogError_", "sentinelleWatchdogSuccessPing_", "sentinelleRunWithWatchdog",
    "sentinelleMetricsRecord_", "sentinelleMetricsSummary_", "sentinelleInstrumentedRun_",
    "sentinelleInstrumentedCheckOnce", "sentinelleInstrumentedPilotCycle",
    "sentinellePreparePilot24h", "sentinellePilotWindowStatus", "sentinellePilotMetrics",
    "sentinelleProductionTick", "sentinelleRecordAutomaticRun_", "sentinelleProductionCloseout_",
    "sentinelleHealthchecksPause_", "sentinelleProductionStatus", "sentinelleGlobalScope_",
    "sentinelleCodeFingerprintText_", "sentinelleCodeFingerprint_", "sentinelleDeploymentReport"
  ],
  fingerprintConfigs: ["DOOMSDAY_SENTINEL", "PATHE_TRUSTED_BOOKING_HOSTS", "DOOMSDAY_BOOKING_V1",
    "DOOMSDAY_METRICS_V1", "DOOMSDAY_PRODUCTION_V1"],
  // SHA-256 of the files at this commit. CI fails if the code changes without it.
  fingerprint: "aa0f0b62da730339b07e14007deca75aed063afe861d063310346f88c1948b45",
  maxAutomaticRunAgeMinutes: 15,
  // Calibrated on the 24 h pilot: Google billed 3897 s for 288 trigger runs
  // while the wrapper measured 3295.7 s => ~2.09 s of per-run overhead that
  // the script cannot see (startup, loading). ESTIMATE ONLY, see quotaNote.
  pilotOverheadSecondsPerRun: 2.09
};

function sentinelleGlobalScope_() { return (function() { return this; })() || {}; }

function sentinelleCodeFingerprintText_() {
  var scope = sentinelleGlobalScope_();
  var normalize = function(text) { return String(text).replace(/\r/g, "").replace(/[ \t]+$/gm, ""); };
  var parts = DOOMSDAY_DEPLOY_EXPECTED.fingerprintFunctions.map(function(name) {
    return typeof scope[name] === "function" ? normalize(scope[name].toString()) : "MISSING " + name;
  }).concat(DOOMSDAY_DEPLOY_EXPECTED.fingerprintConfigs.map(function(name) {
    return name + "=" + (scope[name] === undefined ? "MISSING" : JSON.stringify(scope[name]));
  }));
  return parts.join("\n\u0000\n");
}

function sentinelleCodeFingerprint_() {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    sentinelleCodeFingerprintText_(), Utilities.Charset.UTF_8);
  return bytes.map(function(b) { return ((b + 256) % 256 + 0x100).toString(16).slice(1); }).join("");
}

function sentinelleDeploymentReport() {
  var props = PropertiesService.getScriptProperties();
  var scope = sentinelleGlobalScope_();
  var missing = DOOMSDAY_DEPLOY_EXPECTED.fingerprintFunctions.filter(function(name) {
    return typeof scope[name] !== "function";
  });
  var own = ScriptApp.getProjectTriggers();
  var triggers = own.map(function(t) {
    return { handler: t.getHandlerFunction(), source: String(t.getTriggerSource()),
             type: String(t.getEventType()), uid: String(t.getUniqueId()) };
  });
  var production = triggers.filter(function(t) { return t.handler === "sentinelleProductionTick"; });
  var pilot = triggers.filter(function(t) { return t.handler === "sentinelleInstrumentedPilotCycle"; });
  var identity = null;
  try { identity = Session.getEffectiveUser().getEmail() || null; } catch (_) { identity = null; }
  var metrics = null;
  try { metrics = sentinelleMetricsSummary_(props, Date.now()); } catch (_) { metrics = null; }
  var auto = null;
  try { auto = JSON.parse(props.getProperty(DOOMSDAY_PRODUCTION_V1.lastAutoRunKey) || "null"); } catch (_) { auto = null; }
  var fingerprint = sentinelleCodeFingerprint_();
  var hc = props.getProperty("HC_PING_URL") || "";
  var report = {
    reportRunBy: identity,
    note: "reportRunBy = who runs this report. Trigger ownership is proven by lastAutomaticRun.",
    productionVersionInstalled: typeof DOOMSDAY_PRODUCTION_V1 === "object" ? DOOMSDAY_PRODUCTION_V1.version : null,
    codeFingerprintInstalled: fingerprint,
    codeFingerprintExpected: DOOMSDAY_DEPLOY_EXPECTED.fingerprint,
    missingFunctions: missing,
    productionEnabled: props.getProperty("DOOMSDAY_PRODUCTION_ENABLED") === "true",
    productionUntil: props.getProperty("DOOMSDAY_PRODUCTION_UNTIL") || null,
    closeout: (function() { try { return JSON.parse(props.getProperty("DOOMSDAY_PRODUCTION_CLOSEOUT_V1") || "null"); } catch (_) { return "CORRUPT"; } })(),
    ownTriggers: triggers,
    productionTriggerCount: production.length,
    pilotTriggerCount: pilot.length,
    lastAutomaticRun: auto,
    secrets: {
      telegramToken: !!props.getProperty("TG_BOT_TOKEN"),
      telegramChat: !!props.getProperty("TG_CHAT_ID"),
      alertEmail: !!props.getProperty("ALERT_EMAIL_TO"),
      healthchecksUrlValid: /^https:\/\/hc-ping\.com\/[0-9a-f-]{36}$/i.test(hc),
      healthchecksApiKey: !!props.getProperty("HC_API_KEY")
    },
    last24h: metrics ? {
      cycles: metrics.samplesInLast24h, healthy: metrics.healthySamples,
      // Internal stopwatch of the wrapper: NOT what Google bills.
      measuredWrapperRuntimeMinutes: Math.round(metrics.totalRuntimeSeconds / 6) / 10,
      estimatedGoogleBilledMinutes: Math.round((metrics.totalRuntimeSeconds +
        metrics.samplesInLast24h * DOOMSDAY_DEPLOY_EXPECTED.pilotOverheadSecondsPerRun) / 6) / 10,
      quotaNote: "Estimation. Le quota (90 min/jour, compte entier) se vérifie dans Apps Script > Exécutions (type Déclencheur), tous projets du compte inclus.",
      p95Ms: metrics.p95DurationMs, maxGapSeconds: metrics.maxObservedGapSeconds
    } : null,
    remainingMailQuota: (function() { try { return MailApp.getRemainingDailyQuota(); } catch (_) { return null; } })()
  };
  var problems = [], pendingEvidence = [];
  if (missing.length) problems.push("MISSING_FILES_OR_OLD_CODE");
  if (fingerprint !== DOOMSDAY_DEPLOY_EXPECTED.fingerprint) problems.push("CODE_FINGERPRINT_MISMATCH");
  if (report.productionVersionInstalled !== DOOMSDAY_DEPLOY_EXPECTED.productionVersion) problems.push("VERSION_MISMATCH");
  if (!report.secrets.telegramToken || !report.secrets.telegramChat || !report.secrets.alertEmail) problems.push("SECRETS_MISSING");
  if (!report.secrets.healthchecksUrlValid) problems.push("HEALTHCHECKS_URL_INVALID");
  if (report.pilotTriggerCount) problems.push("EXPIRED_PILOT_TRIGGER_PRESENT");
  if (report.productionEnabled && report.productionTriggerCount !== 1) problems.push("PRODUCTION_TRIGGER_COUNT_NOT_1");
  if (!report.productionEnabled && report.productionTriggerCount) problems.push("TRIGGER_PRESENT_BUT_DISABLED");
  if (report.closeout && report.closeout.status === "CLOSEOUT_INCOMPLETE") problems.push("CLOSEOUT_INCOMPLETE_" + report.closeout.reason);
  if (report.productionEnabled && !problems.length) {
    if (!auto) pendingEvidence.push("NO_AUTOMATIC_RUN_YET");
    else {
      var ownUids = production.map(function(t) { return t.uid; });
      var ageMin = (Date.now() - Date.parse(auto.atUtc)) / 60000;
      if (ownUids.indexOf(auto.triggerUid) === -1) problems.push("AUTOMATIC_RUN_FROM_A_TRIGGER_NOT_OWNED_BY_THIS_ACCOUNT");
      if (auto.identity !== identity) problems.push("AUTOMATIC_RUN_IDENTITY_DIFFERS_FROM_REPORT_RUNNER");
      if (auto.fingerprint !== fingerprint) problems.push("AUTOMATIC_RUN_CODE_FINGERPRINT_DIFFERS");
      if (!(ageMin <= DOOMSDAY_DEPLOY_EXPECTED.maxAutomaticRunAgeMinutes)) problems.push("LAST_AUTOMATIC_RUN_STALE");
      if (auto.watchdog !== "ACKNOWLEDGED") pendingEvidence.push("LAST_AUTOMATIC_RUN_WATCHDOG_" + String(auto.watchdog));
    }
  }
  report.problems = problems;
  report.pendingEvidence = pendingEvidence;
  report.verdict = problems.length ? "NOT_READY" :
    !report.productionEnabled ? "READY_TO_ENABLE" :
    pendingEvidence.length ? "ENABLED_AWAITING_EVIDENCE" : "LIVE_VERIFIED";
  console.log(JSON.stringify(report));
  return report;
}
// ===== END tools/google_apps_script_deploy_check.gs =====
