/**
 * Sentinelle Doomsday — read-only deployment report (expert audit 2026-11-20).
 *
 * Run MANUALLY from the Apps Script editor before and after enabling production.
 * It fetches nothing from Pathé, sends no notification, pings no watchdog and
 * creates/deletes no trigger. It prints NO secret value (only presence flags).
 *
 * Proves, from inside the real project:
 *  - which Google identity the code and its triggers run as (quota owner);
 *  - which code revision is installed (per-file version markers);
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
  productionVersion: "production-v1.1-audit-20261120",
  requiredFunctions: [
    "sentinelleProductionTick", "sentinelleRunWithWatchdog", "sentinelleCheckWithBookingOnce",
    "sentinelleCheckOnce", "patheShowtimeSignalsV1", "sentinelleInstrumentedRun_",
    "sentinelleTelegramText_", "sentinelleUncertainAlert_"
  ]
};

function sentinelleDeploymentReport() {
  var props = PropertiesService.getScriptProperties();
  var scope = (function() { return this; })() || {};
  var missing = DOOMSDAY_DEPLOY_EXPECTED.requiredFunctions.filter(function(name) {
    return typeof scope[name] !== "function";
  });
  var triggers = ScriptApp.getProjectTriggers().map(function(t) {
    return { handler: t.getHandlerFunction(), source: String(t.getTriggerSource()),
             type: String(t.getEventType()) };
  });
  var production = triggers.filter(function(t) { return t.handler === "sentinelleProductionTick"; });
  var pilot = triggers.filter(function(t) { return t.handler === "sentinelleInstrumentedPilotCycle"; });
  var identity = null;
  try { identity = Session.getEffectiveUser().getEmail() || null; } catch (_) { identity = null; }
  var metrics = null;
  try { metrics = sentinelleMetricsSummary_(props, Date.now()); } catch (_) { metrics = null; }
  var hc = props.getProperty("HC_PING_URL") || "";
  var report = {
    executionIdentity: identity,
    productionVersionInstalled: typeof DOOMSDAY_PRODUCTION_V1 === "object" ? DOOMSDAY_PRODUCTION_V1.version : null,
    productionVersionExpected: DOOMSDAY_DEPLOY_EXPECTED.productionVersion,
    missingFunctions: missing,
    productionEnabled: props.getProperty("DOOMSDAY_PRODUCTION_ENABLED") === "true",
    productionUntil: props.getProperty("DOOMSDAY_PRODUCTION_UNTIL") || null,
    triggers: triggers,
    productionTriggerCount: production.length,
    pilotTriggerCount: pilot.length,
    secrets: {
      telegramToken: !!props.getProperty("TG_BOT_TOKEN"),
      telegramChat: !!props.getProperty("TG_CHAT_ID"),
      alertEmail: !!props.getProperty("ALERT_EMAIL_TO"),
      healthchecksUrlValid: /^https:\/\/hc-ping\.com\/[0-9a-f-]{36}$/i.test(hc)
    },
    last24h: metrics ? {
      cycles: metrics.samplesInLast24h, healthy: metrics.healthySamples,
      runtimeMinutes: Math.round(metrics.totalRuntimeSeconds / 6) / 10,
      p95Ms: metrics.p95DurationMs, maxGapSeconds: metrics.maxObservedGapSeconds
    } : null,
    remainingMailQuota: (function() { try { return MailApp.getRemainingDailyQuota(); } catch (_) { return null; } })()
  };
  var problems = [];
  if (missing.length) problems.push("MISSING_FILES_OR_OLD_CODE");
  if (report.productionVersionInstalled !== report.productionVersionExpected) problems.push("VERSION_MISMATCH");
  if (!report.secrets.telegramToken || !report.secrets.telegramChat || !report.secrets.alertEmail) problems.push("SECRETS_MISSING");
  if (!report.secrets.healthchecksUrlValid) problems.push("HEALTHCHECKS_URL_INVALID");
  if (report.pilotTriggerCount) problems.push("EXPIRED_PILOT_TRIGGER_PRESENT");
  if (report.productionEnabled && report.productionTriggerCount !== 1) problems.push("PRODUCTION_TRIGGER_COUNT_NOT_1");
  if (!report.productionEnabled && report.productionTriggerCount) problems.push("TRIGGER_PRESENT_BUT_DISABLED");
  report.problems = problems;
  report.verdict = problems.length ? "NOT_READY" :
    (report.productionEnabled ? "LIVE_CONFIGURATION_OK" : "READY_TO_ENABLE");
  console.log(JSON.stringify(report));
  return report;
}
