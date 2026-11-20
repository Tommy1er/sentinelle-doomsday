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
