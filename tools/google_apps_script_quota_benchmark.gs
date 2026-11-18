/**
 * Sentinelle Doomsday — read-only Apps Script runtime benchmark.
 *
 * MANUAL ONLY — no triggers, no properties written, no MailApp, Telegram,
 * Healthchecks, payment or reservation. Reuses the exact detailed API request
 * and parser helpers of the integrated booking monitor.
 *
 * Usage in a private Apps Script project after code review:
 *   sentinelleBenchmark8Once()    // core /cinemas + 8 detailed days (1 batch)
 *   sentinelleBenchmark20Once()   // core /cinemas + 20 days (8+8+4)
 *
 * These are REAL-NETWORK spot measurements, not a measurement of all 288
 * scheduled cycles, daily script quota, other projects or future populated
 * calendars. They intentionally omit ScriptProperties writes, queue delivery
 * and Healthchecks. Do not equate them to complete trigger runtimes.
 */
var DOOMSDAY_QUOTA_BENCHMARK = {
  additionalDates: [
    "2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12",
    "2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24",
    "2026-12-25", "2026-12-26", "2026-12-27", "2026-12-28"
  ],
  maxApiBytes: 300000,
  dateCountOptions: [8,20]
};

function sentinelleBenchmarkDates_(dateCount) {
  if (dateCount!==8 && dateCount!==20) throw new Error("Benchmark dates must be 8 or 20");
  var anchors=DOOMSDAY_BOOKING_V1.anchorDates;
  if (!Array.isArray(anchors)||anchors.length!==8) throw new Error("Unexpected anchor setup");
  var extras=dateCount===20 ? DOOMSDAY_QUOTA_BENCHMARK.additionalDates : [];
  var dates=anchors.concat(extras);
  if (new Set(dates).size!==dateCount) throw new Error("Duplicate dates in benchmark");
  dates.forEach(function(d) {
    if (typeof d!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new Error("Invalid date in benchmark");
    }
  });
  return dates;
}

function sentinelleBenchmarkReadOnce_(dateCount) {
  var started=Date.now(), nowUtc=new Date().toISOString();
  var dates=sentinelleBenchmarkDates_(dateCount);
  var coreStart=Date.now(), coreStatus, coreDays=null;
  var coreResponse=UrlFetchApp.fetch(DOOMSDAY_SENTINEL.endpoint,{
    muteHttpExceptions:true,followRedirects:true,validateHttpsCertificates:true,
    headers:{Accept:"application/json"}
  });
  coreStatus=coreResponse.getResponseCode();
  if(coreStatus===200) {
    var coreBody=coreResponse.getContentText();
    if(coreBody.length>DOOMSDAY_QUOTA_BENCHMARK.maxApiBytes)throw new Error("Core response oversized");
    var parsed=sentinelleNormalize_(JSON.parse(coreBody));
    coreDays=parsed.days.length;
  }
  var coreMs=Date.now()-coreStart, batchStats=[],valid=0,unknown=0,failed=0;
  var datesChecked=0, sessions=0, statusBreakdown={};
  for(var offset=0;offset<dates.length;offset+=DOOMSDAY_BOOKING_V1.detailBatchSize) {
    var group=dates.slice(offset,offset+DOOMSDAY_BOOKING_V1.detailBatchSize);
    var t0=Date.now(),results=null,parseMs=0;
    try {
      results=UrlFetchApp.fetchAll(group.map(sentinelleDetailedRequest_));
      if(!Array.isArray(results)||results.length!==group.length)throw new Error("Unexpected batch cardinality");
    }catch(e) {
      failed+=group.length;
      batchStats.push({size:group.length,elapsedMs:Date.now()-t0,
        valid:0,unknown:0,failed:group.length,transportError:true});
      continue;
    }
    var bValid=0,bUnknown=0,bFailed=0;
    group.forEach(function(date,i) {
      datesChecked++;
      try{
        var status=results[i].getResponseCode(),key=String(status);
        statusBreakdown[key]=(statusBreakdown[key]||0)+1;
        var parseStart=Date.now();
        var detail=sentinelleDetailedRead_(date,nowUtc,results[i]);
        parseMs+=Date.now()-parseStart;
        if(detail.kind==="VALID") {
          bValid++;valid++;
          // Execute the same pure snapshot serialization in memory but do not
          // read or write any property, queue, or notification.
          sentinelleDetailedSmallSnapshot_(detail.sessions);
          sessions+=detail.sessions.length;
        }else{bUnknown++;unknown++;}
      }catch(e){bFailed++;failed++;}
    });
    batchStats.push({size:group.length,elapsedMs:Date.now()-t0,
      parseMs:parseMs,valid:bValid,unknown:bUnknown,failed:bFailed});
  }
  var result={
    benchmark:"READ_ONLY",checkedAtUtc:nowUtc,dateCount:dateCount,
    totalMs:Date.now()-started,coreMs:coreMs,coreHttpStatus:coreStatus,
    coreProgrammedDays:coreDays,
    detailedDateCount:datesChecked,validDetailedDays:valid,
    unknownDetailedDays:unknown,failedDetailedDays:failed,
    sessionsParsed:sessions,statusBreakdown:statusBreakdown,
    batches:batchStats,
    triggerCreated:false,stateWritten:false,notificationSent:false,heartbeatSent:false,
    limitation:"Read-only public API benchmark; excludes PropertiesService writes, message delivery, Healthchecks and actual daily quota consumption. Empty future responses may underestimate fully programmed loads."
  };
  console.log(JSON.stringify(result));
  return result;
}
function sentinelleBenchmark8Once() {
  return sentinelleBenchmarkReadOnce_(8);
}
function sentinelleBenchmark20Once() {
  return sentinelleBenchmarkReadOnce_(20);
}
