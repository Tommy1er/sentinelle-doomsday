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
    r.partialDateCoverage===false && r.datesNotCheckedThisCycle===0 &&
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
