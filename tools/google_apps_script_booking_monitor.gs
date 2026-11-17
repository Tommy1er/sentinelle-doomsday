/**
 * Sentinelle Doomsday — detailed commercial-signal integration (candidate).
 *
 * Apps Script project MUST also include:
 * - tools/google_apps_script_sentinel.gs
 * - tools/google_apps_script_showtime_signal.gs
 *
 * No trigger is created. Run sentinelleCheckWithBookingOnce() manually
 * after installation; then validate endpoints and notification receipts.
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
  anchorDates: ["2026-12-16", "2026-12-17", "2026-12-18"],
  maxDatesPerCheck: 14
};

function sentinelleDetailedDates_(coreState) {
  var all = {};
  DOOMSDAY_BOOKING_V1.anchorDates.forEach(function(d) { all[d] = true; });
  (coreState && Array.isArray(coreState.days) ? coreState.days : []).forEach(function(day) {
    all[day.date] = true;
  });
  var ordered = Object.keys(all).sort();
  if (ordered.length > DOOMSDAY_BOOKING_V1.maxDatesPerCheck) {
    throw new Error("Detailed coverage exceeds maxDatesPerCheck; do not silently truncate");
  }
  return ordered;
}

function sentinelleDetailedRead_(date, nowUtc) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid detail date");
  var endpoint = "https://www.pathe.ma/api/show/" + DOOMSDAY_BOOKING_V1.film +
    "/showtimes/" + DOOMSDAY_BOOKING_V1.cinema + "/" + date;
  var response = UrlFetchApp.fetch(endpoint, {
    muteHttpExceptions: true, followRedirects: true,
    validateHttpsCertificates: true,
    headers: { Accept: "application/json" }
  });
  var status = response.getResponseCode();
  // 404 is NOT proof of no tickets. It is unknown until schema/behavior
  // before programming is validated with a real target response.
  if (status === 404) return { date: date, kind: "UNKNOWN_404", sessions: null };
  if (status !== 200) throw new Error("Detailed showtime HTTP " + status);
  var body = response.getContentText();
  if (body.length > 300000) throw new Error("Oversized detailed response");
  var raw = JSON.parse(body);
  var signals = patheShowtimeSignalsV1(raw, nowUtc);
  signals.forEach(function(s) {
    if (s.localTime.slice(0, 10) !== date) {
      throw new Error("Unexpected cross-date detailed session");
    }
  });
  return { date: date, kind: "VALID", sessions: signals };
}

function sentinelleDetailedSmallSnapshot_(signals) {
  var result = signals.map(function(s) {
    return {
      id: s.id,
      time: s.localTime,
      version: s.version,
      open: s.bookingProposedByApi === true,
      imax: s.imaxByTag === true,
      url: s.bookingUrl || null
    };
  });
  var serialized = JSON.stringify(result);
  // Stored values are predominantly ASCII; use a conservative code-unit
  // ceiling and fail instead of truncating any bookability information.
  if (serialized.length > 7000) throw new Error("Detailed snapshot storage budget exhausted");
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

function sentinelleDetailedAlert_(date, opened) {
  var lines = [
    "🚨 AVENGERS: DOOMSDAY — RÉSERVATION PROPOSÉE PAR L'API PATHÉ",
    "Cinéma : Pathé Californie — Casablanca",
    "Date : " + date,
    "Attention : ce signal ne garantit pas de places encore disponibles ni un paiement réussi.",
    "IMAX Laser : non vérifié (un tag IMAX seul n'atteste pas Laser).",
    "Séances détectées :"
  ];
  opened.slice(0, 10).forEach(function(s) {
    lines.push("- " + s.time + " — " + s.version +
      (s.imax ? " — IMAX (Laser non confirmé)" : " — format à confirmer"));
    if (s.url) lines.push("  Réserver : " + s.url);
  });
  lines.push("Fiche officielle : " + DOOMSDAY_SENTINEL.publicPage);
  return {
    subject: "🚨 DOOMSDAY — signal de réservation Pathé Californie " + date,
    body: lines.join("\n")
  };
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
    var dates = sentinelleDetailedDates_(baseline);
    var good = 0, unknown = 0, failures = 0, newlyOpen = 0;
    var errors = [];
    for (var i = 0; i < dates.length; i++) {
      var date = dates[i];
      try {
        var detail = sentinelleDetailedRead_(date, now);
        if (detail.kind !== "VALID") {
          unknown++;
          continue; // Preserve previously healthy snapshot.
        }
        good++;
        var key = DOOMSDAY_BOOKING_V1.detailsPrefix + date;
        var old = sentinelleReadJsonProperty_(props, key, null);
        if (old !== null && !Array.isArray(old)) throw new Error("Invalid old details snapshot");
        var current = sentinelleDetailedSmallSnapshot_(detail.sessions);
        var newSales = sentinelleDetailedChanges_(old, current);
        if (newSales.length) {
          var alert = sentinelleDetailedAlert_(date, newSales);
          sentinelleEnqueue_(props, alert.subject, alert.body);
          newlyOpen += newSales.length;
        }
        // After enqueue, never before; any pending channel will be retried.
        props.setProperty(key, JSON.stringify(current));
      } catch (error) {
        failures++;
        // Do not disclose details/credentials/response bodies in logs.
        errors.push({ date: date, errorType: String(error.name || "Error") });
      }
    }
    if (good > 0 && failures === 0) {
      props.setProperty(DOOMSDAY_BOOKING_V1.lastDetailOk, new Date().toISOString());
      props.setProperty(DOOMSDAY_BOOKING_V1.detailFailures, "0");
    } else {
      var consecutive = Number(props.getProperty(DOOMSDAY_BOOKING_V1.detailFailures) || "0") + 1;
      props.setProperty(DOOMSDAY_BOOKING_V1.detailFailures, String(consecutive));
      if (consecutive === 3 || consecutive === 12) {
        sentinelleEnqueue_(props, "⚠️ [DOOMSDAY] Couverture billetterie dégradée",
          "Impossible de confirmer la lecture détaillée de toutes les séances depuis " +
          consecutive + " contrôles.\nDernière lecture détaillée saine : " +
          (props.getProperty(DOOMSDAY_BOOKING_V1.lastDetailOk) || "aucune") +
          "\nExaminer immédiatement : " + DOOMSDAY_SENTINEL.publicPage);
      }
    }
    var sent = sentinelleFlushOutbox_(props);
    var report = {
      checkedAtUtc: now,
      cinemaProgramme: coreSummary ? coreSummary.status : "CORE_ERROR",
      coreErrorType: coreError,
      datesChecked: dates.length,
      validDetailedDays: good,
      unknownDetailedDays: unknown,
      failedDetailedDays: failures,
      newReservableSessions: newlyOpen,
      delivery: sent,
      errors: errors
    };
    console.log(JSON.stringify(report));
    return report;
  } finally {
    lock.releaseLock();
  }
}
