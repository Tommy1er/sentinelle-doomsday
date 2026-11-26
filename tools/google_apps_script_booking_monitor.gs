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
  // 2026-11-26: standard halls are already on sale; only IMAX matters now.
  // IMAX sessions get their own subject and the insistent reminder;
  // additional standard sessions are still mailed, quietly, without reminder.
  // Set Script Property DOOMSDAY_IMAX_PRIORITY=false to restore the old behaviour.
  imaxPriorityKey: "DOOMSDAY_IMAX_PRIORITY",
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

function sentinelleIsImax_(s) { return s.imaxByTag === true || s.imaxByAuditorium === true; }

function sentinelleImaxAlert_(date, sessions, opened) {
  var lines = [
    opened ? "🎬🚨 IMAX OUVERT — AVENGERS: DOOMSDAY — PATHÉ CALIFORNIE"
           : "🎬 IMAX PUBLIÉ — AVENGERS: DOOMSDAY — PATHÉ CALIFORNIE (ventes pas encore ouvertes)",
    "Date : " + date,
    opened ? "Réserve MAINTENANT : les meilleures places IMAX partent en premier."
           : "Ouverture des ventes annoncée : " + sentinelleCasablancaTime_(sessions.map(function(s) {
               return s.reservabilityStart; }).filter(function(x) { return !!x; }).sort()[0] || ""),
    "Séances IMAX :"
  ];
  sessions.slice(0, 10).forEach(function(s) {
    lines.push(sentinelleSessionLine_(s));
    if (s.bookingUrl) lines.push("  Réserver : " + s.bookingUrl);
  });
  if (sessions.length > 10) lines.push("… et " + (sessions.length - 10) + " autres séances IMAX.");
  lines.push("Laser : à confirmer sur la page de réservation. Aucun achat automatique.");
  lines.push("Fiche officielle : " + DOOMSDAY_SENTINEL.publicPage);
  return {
    subject: (opened ? "🎬🚨 IMAX OUVERT — Doomsday Pathé Californie " : "🎬 IMAX publié — Doomsday Pathé Californie ") + date,
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
    var good = 0, unknown = 0, failures = 0, newlyOpen = 0, newlyListed = 0, anomalies = 0, newImax = 0;
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
          var imaxPriority = props.getProperty(DOOMSDAY_BOOKING_V1.imaxPriorityKey) !== "false";
          var imaxOpen = newSales.filter(sentinelleIsImax_);
          var imaxListed = listed.filter(sentinelleIsImax_);
          if (imaxPriority) {
            if (imaxOpen.length) {
              var imaxAlert = sentinelleImaxAlert_(date, imaxOpen, true);
              sentinelleEnqueue_(props, imaxAlert.subject, imaxAlert.body);
              sentinelleArmCritical_(props, now, imaxAlert.body);
              newImax += imaxOpen.length;
            }
            if (imaxListed.length) {
              var imaxNotice = sentinelleImaxAlert_(date, imaxListed, false);
              sentinelleEnqueue_(props, imaxNotice.subject, imaxNotice.body);
              sentinelleArmCritical_(props, now, imaxNotice.body);
              newImax += imaxListed.length;
            }
            // Standard sessions: still reported, but no reminder and a calm subject.
            newSales = newSales.filter(function(x) { return !sentinelleIsImax_(x); });
            listed = listed.filter(function(x) { return !sentinelleIsImax_(x); });
          }
          if (newSales.length) {
            var alert = sentinelleDetailedAlert_(date, newSales);
            if (imaxPriority) {
              alert.subject = "ℹ️ DOOMSDAY — séances classiques ajoutées (pas IMAX) " + date;
            }
            sentinelleEnqueue_(props, alert.subject, alert.body);
            if (!imaxPriority) sentinelleArmCritical_(props, now, alert.body);
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
      newImaxSessions: newImax,
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
