/**
 * Manual integration checks. No triggers, purchases or simulated availability.
 * Measured target check may send legitimate monitor events through its normal
 * outbox. Positive control only reads public data and never sends messages.
 */
function sentinelleMeasuredIntegrationCheck() {
  var started=Date.now();
  var result=sentinelleCheckWithBookingOnce();
  var props=PropertiesService.getScriptProperties();
  var summary={
    build:"11fa8013b7cde6af51e0dd6ce6c755fe01730fa1",
    durationMs:Date.now()-started,
    report:result,
    anchorSnapshots:DOOMSDAY_BOOKING_V1.anchorDates.map(function(date){
      var snapshot=sentinelleReadJsonProperty_(props,DOOMSDAY_BOOKING_V1.detailsPrefix+date,null);
      return {date:date,storedSessionCount:Array.isArray(snapshot)?snapshot.length:null};
    }),
    lastDetailedOk:props.getProperty(DOOMSDAY_BOOKING_V1.lastDetailOk),
    detailFailureStreak:Number(props.getProperty(DOOMSDAY_BOOKING_V1.detailFailures)||"0")
  };
  console.log(JSON.stringify(summary));return summary;
}
function sentinelleReadOnlyPositiveControl() {
  var started=Date.now(),original=DOOMSDAY_BOOKING_V1.film;
  var date=Utilities.formatDate(new Date(),"Africa/Casablanca","yyyy-MM-dd");
  try {
    DOOMSDAY_BOOKING_V1.film="comment-braquer-une-banque-56359";
    var detail=sentinelleDetailedRead_(date,new Date().toISOString());
    var sessions=detail.sessions||[];
    var summary={checkedAtUtc:new Date().toISOString(),film:DOOMSDAY_BOOKING_V1.film,
      date:date,kind:detail.kind,sessionCount:sessions.length,
      apiProposedCount:sessions.filter(function(s){return s.bookingProposedByApi;}).length,
      sample:sessions.slice(0,2).map(function(s){return {
        time:s.localTime,version:s.version,status:s.status,
        apiProposed:s.bookingProposedByApi,bookingUrl:s.bookingUrl,
        imax:s.imaxByTag,laserConfirmed:s.imaxLaserConfirmed};}),
      durationMs:Date.now()-started,notificationsSent:0};
    console.log(JSON.stringify(summary));return summary;
  } finally {DOOMSDAY_BOOKING_V1.film=original;}
}
