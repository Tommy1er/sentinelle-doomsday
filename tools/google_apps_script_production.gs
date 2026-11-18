/**
 * Sentinelle Doomsday — permanent monitor entry point.
 *
 * Production is OFF until private Script Property
 * DOOMSDAY_PRODUCTION_ENABLED = true.
 *
 * Designed for one 5-minute time-driven trigger AFTER live benchmarks, a
 * shared-quota decision, recipient validation and watchdog readiness.
 *
 * Never use sentinelleInstrumentedPilotCycle for permanent monitoring: its
 * 24-hour window is expired by design.
 *
 * This file creates NO triggers and contains NO secrets.
 */
var DOOMSDAY_PRODUCTION_V1 = {
  enableKey: "DOOMSDAY_PRODUCTION_ENABLED",
  version: "production-v1"
};

/**
 * Scheduler entry point. Returns a no-op if explicitly disabled.
 * Uses the already-tested booking + independent watchdog + metrics pipeline.
 */
function sentinelleProductionTick() {
  var props=PropertiesService.getScriptProperties();
  if (props.getProperty(DOOMSDAY_PRODUCTION_V1.enableKey) !== "true") {
    var skipped={mode:"PRODUCTION",status:"DISABLED",triggerCreated:false};
    console.log(JSON.stringify(skipped));
    return skipped;
  }
  // Reuses bounded telemetry, locks and channel retry behavior.
  return sentinelleInstrumentedRun_(function(){
    return sentinelleRunWithWatchdog();
  });
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
