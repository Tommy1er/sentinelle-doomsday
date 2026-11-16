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
  var cinema = payload[DOOMSDAY_SENTINEL.cinemaKey];
  if (cinema === undefined || cinema === null) {
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
    return {
      date: date,
      versions: sentinelleUniqueStrings_(day.versions, "versions"),
      tags: sentinelleUniqueStrings_(day.tags, "tags")
    };
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
    " | tags : " + (day.tags.join(", ") || "non renseignés");
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
    if (failures === 3 || failures === 12) {
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
  if (outbox.length >= 15) throw new Error("Pending alert queue full, investigate delivery");
  // Unique ID only; never include credentials in logs.
  outbox.push({ id: new Date().getTime() + "-" + Math.random().toString(36).slice(2, 8),
                subject: subject, body: body, pending: ["telegram", "gmail"] });
  props.setProperty(DOOMSDAY_SENTINEL.outboxKey, JSON.stringify(outbox));
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
        if (channel === "telegram") sentinelleSendTelegram_(props, item.body);
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
