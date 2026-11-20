/**
 * Bounded instrumentation only. This file creates NO trigger.
 * Manual check does NOT ping Healthchecks or change its paused state.
 * Future pilot entry point pings only through the existing healthy-cycle wrapper.
 */
var DOOMSDAY_METRICS_V1={prefix:"DOOMSDAY_METRICS_V1_",chunkSize:48,chunks:6};
function sentinelleMetricsRecord_(props,sample) {
  var cfg=DOOMSDAY_METRICS_V1;
  var raw=props.getProperty(cfg.prefix+"COUNT");
  var count=raw===null?0:Number(raw);
  if(!Number.isSafeInteger(count)||count<0)throw new Error("Metrics count invalid");
  var index=Math.floor(count/cfg.chunkSize)%cfg.chunks;
  var offset=count%cfg.chunkSize,key=cfg.prefix+"CHUNK_"+index;
  var rows=JSON.parse(props.getProperty(key)||"[]");
  var expected=count>=cfg.chunkSize*cfg.chunks?cfg.chunkSize:offset;
  if(!Array.isArray(rows)||rows.length!==expected)throw new Error("Metrics chunk invalid");
  rows[offset]=sample;
  var text=JSON.stringify(rows);
  if(text.length>7000)throw new Error("Metrics chunk storage limit");
  // Both changes are recoverable observational data, not alert delivery state.
  props.setProperty(key,text);
  props.setProperty(cfg.prefix+"COUNT",String(count+1));
}
function sentinelleMetricsSummary_(props,nowMs) {
  var cfg=DOOMSDAY_METRICS_V1,rows=[],raw=props.getProperty(cfg.prefix+"COUNT");
  var count=raw===null?0:Number(raw);
  if(!Number.isSafeInteger(count)||count<0)throw new Error("Metrics count invalid");
  for(var i=0;i<cfg.chunks;i++){
    var chunk=props.getProperty(cfg.prefix+"CHUNK_"+i);
    if(chunk===null)continue;
    var parsed=JSON.parse(chunk);
    if(!Array.isArray(parsed)||parsed.length>cfg.chunkSize)throw new Error("Metrics chunk invalid");
    rows=rows.concat(parsed);
  }
  rows=rows.filter(function(r){return r.t>=nowMs-86400000 && r.t<=nowMs;})
    .sort(function(a,b){return a.t-b.t;});
  var durations=rows.map(function(r){return r.ms;}).sort(function(a,b){return a-b;});
  var total=durations.reduce(function(a,b){return a+b;},0),healthy=0,maxGap=0;
  rows.forEach(function(r,i){if(r.h)healthy++;if(i)maxGap=Math.max(maxGap,r.t-rows[i-1].t);});
  var p95=durations.length?durations[Math.ceil(durations.length*0.95)-1]:null;
  return {samplesInLast24h:rows.length,totalSamplesRecorded:count,
    retainedCapacity:cfg.chunkSize*cfg.chunks,
    firstSampleUtc:rows.length?new Date(rows[0].t).toISOString():null,
    lastSampleUtc:rows.length?new Date(rows[rows.length-1].t).toISOString():null,
    observedSpanMinutes:rows.length?(rows[rows.length-1].t-rows[0].t)/60000:0,
    healthySamples:healthy,degradedOrFailedSamples:rows.length-healthy,
    totalRuntimeSeconds:total/1000,p95DurationMs:p95,
    maxDurationMs:durations.length?durations[durations.length-1]:null,
    maxObservedGapSeconds:rows.length>1?maxGap/1000:null,
    warning:"Manual samples are not proof of a running 24-hour trigger; retained samples are bounded."};
}
function sentinelleInstrumentedRun_(runner) {
  // Separate lock: the detector itself acquires the script lock.
  var lock=LockService.getUserLock();
  if(!lock.tryLock(1000))throw new Error("Instrumented run already active");
  var start=Date.now(),r=null,error=null;
  try {
    try {r=runner();}catch(e){error=String(e.name||"Error");}
    var report=r&&r.report?r.report:r;
    var sample={t:start,ms:Date.now()-start,h:!error&&sentinelleHealthyForWatchdog_(report)?1:0,
      d:report&&Number.isInteger(report.datesChecked)?report.datesChecked:0,
      f:report&&Number.isInteger(report.failedDetailedDays)?report.failedDetailedDays:0,
      u:report&&Number.isInteger(report.unknownDetailedDays)?report.unknownDetailedDays:0,
      p:report&&report.delivery?Number(report.delivery.pending||0):0,e:error};
    sentinelleMetricsRecord_(PropertiesService.getScriptProperties(),sample);
    console.log(JSON.stringify({instrumented:true,sample:sample,
      watchdog:r&&r.watchdog?r.watchdog:"NOT_SENT_MANUAL_CHECK"}));
    if(error)throw new Error("Instrumented check failed; sample recorded");
    return r;
  }finally{lock.releaseLock();}
}
/** Safe manual readiness measurement: no heartbeat, no trigger creation. */
function sentinelleInstrumentedCheckOnce() {
  return sentinelleInstrumentedRun_(function(){return sentinelleCheckWithBookingOnce();});
}
/** Candidate for a future explicitly installed pilot trigger. Not run automatically. */
function sentinelleInstrumentedPilotCycle() {
  var props=PropertiesService.getScriptProperties();
  var raw=props.getProperty("DOOMSDAY_PILOT_WINDOW_V1");
  if(!raw)throw new Error("Pilot window not prepared");
  var window=JSON.parse(raw),now=Date.now();
  if(window.status==="PREPARED") {
    window.status="RUNNING";window.startedAtUtc=new Date(now).toISOString();
    window.endsAtUtc=new Date(now+86400000).toISOString();
    window.baselineCount=Number(props.getProperty(DOOMSDAY_METRICS_V1.prefix+"COUNT")||"0");
    props.setProperty("DOOMSDAY_PILOT_WINDOW_V1",JSON.stringify(window));
  }
  if(window.status!=="RUNNING"&&window.status!=="EXPIRED")throw new Error("Pilot window invalid");
  var end=Date.parse(window.endsAtUtc);
  if(!isFinite(end))throw new Error("Pilot end invalid");
  if(now>=end) {
    if(window.status==="RUNNING") {
      sentinelleEnqueue_(props,"[DOOMSDAY] Pilote 24 h terminé",
        "La fenêtre de collecte du pilote est terminée. Les lectures Pathé et heartbeats sont arrêtés."+
        "\nRevoir les métriques, supprimer le déclencheur et mettre Healthchecks en pause."+
        "\nUne alerte DOWN après cette fin programmée correspond à cet arrêt attendu, pas à une panne Pathé.");
      window.status="EXPIRED";
      props.setProperty("DOOMSDAY_PILOT_WINDOW_V1",JSON.stringify(window));
    }
    var delivery=sentinelleFlushOutbox_(props);
    console.log(JSON.stringify({pilot:"EXPIRED",endsAtUtc:window.endsAtUtc,delivery:delivery}));
    return {pilot:"EXPIRED",delivery:delivery};
  }
  if(window.status!=="RUNNING")throw new Error("Expired pilot cannot restart");
  return sentinelleInstrumentedRun_(function(){return sentinelleRunWithWatchdog();});
}
/** Prepare only; no trigger or heartbeat created. First pilot cycle starts the clock. */
function sentinellePreparePilot24h() {
  var props=PropertiesService.getScriptProperties();
  var receipt=JSON.parse(props.getProperty("DOOMSDAY_RECEIPT_TEST_V1")||"null");
  if(!receipt||receipt.acknowledged!==true)throw new Error("Telegram recipient acknowledgement required");
  var old=JSON.parse(props.getProperty("DOOMSDAY_PILOT_WINDOW_V1")||"null");
  if(old)throw new Error("Pilot window already exists; review before replacement");
  var result=sentinelleInstrumentedCheckOnce();
  if(!sentinelleHealthyForWatchdog_(result))throw new Error("Pilot preflight degraded");
  var window={status:"PREPARED",preparedAtUtc:new Date().toISOString(),
    startedAtUtc:null,endsAtUtc:null,baselineCount:null};
  props.setProperty("DOOMSDAY_PILOT_WINDOW_V1",JSON.stringify(window));
  console.log(JSON.stringify({pilot:window,triggerCreated:false,heartbeatSent:false}));
  return window;
}
function sentinellePilotWindowStatus() {
  var raw=PropertiesService.getScriptProperties().getProperty("DOOMSDAY_PILOT_WINDOW_V1");
  var result=raw?JSON.parse(raw):null;
  console.log(JSON.stringify({pilot:result}));return result;
}
function sentinellePilotMetrics() {
  var result=sentinelleMetricsSummary_(PropertiesService.getScriptProperties(),Date.now());
  console.log(JSON.stringify(result));return result;
}
