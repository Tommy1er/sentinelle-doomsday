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
  anchorDates: ["2026-12-13", "2026-12-14", "2026-12-15",
    "2026-12-16", "2026-12-17", "2026-12-18", "2026-12-19", "2026-12-20"],
  maxDatesPerCheck: 20,
  cursorKey: "DOOMSDAY_DETAIL_ROTATION_CURSOR_V1",
  partialKey: "DOOMSDAY_DETAIL_PARTIAL_NOTICE_V1"
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
  var selected=anchors.concat(selectedExtras).sort();
  // Attach enumerable metadata for diagnostic/logging, not persisted as a list.
  selected.totalDates=anchors.length+extras.length;
  selected.skippedDates=Math.max(0,extras.length-selectedExtras.length);
  selected.coveragePartial=selected.skippedDates>0;
  return selected;
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
    var dates = sentinelleDetailedDates_(baseline, props);
    var good = 0, unknown = 0, failures = 0, newlyOpen = 0;
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
    var sent = sentinelleFlushOutbox_(props);
    var report = {
      checkedAtUtc: now,
      cinemaProgramme: coreSummary ? coreSummary.status : "CORE_ERROR",
      coreErrorType: coreError,
      datesChecked: dates.length,
      totalCandidateDates: dates.totalDates,
      datesNotCheckedThisCycle: dates.skippedDates,
      partialDateCoverage: dates.coveragePartial,
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
