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
function sentinelleWatchdogSuccessPing_() {
  var url=PropertiesService.getScriptProperties().getProperty("HC_PING_URL");
  if (!url || !/^https:\/\/hc-ping\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url)) {
    throw new Error("Watchdog private URL missing or invalid");
  }
  var response;
  try {
    response=UrlFetchApp.fetch(url,{
      method:"get",muteHttpExceptions:true,followRedirects:false,
      validateHttpsCertificates:true
    });
    // Healthchecks can answer 200 with 'OK (not found)' or 'OK (rate limited)'.
    // Only the ordinary acknowledged OK is accepted; never log private URL.
    if(response.getResponseCode()!==200 || response.getContentText().trim()!=="OK") {
      throw new Error("not acknowledged");
    }
  } catch (_) {
    throw new Error("Watchdog success ping not acknowledged");
  }
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
