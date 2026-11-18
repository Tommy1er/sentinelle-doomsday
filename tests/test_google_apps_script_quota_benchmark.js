"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const files=[
  "tools/google_apps_script_sentinel.gs",
  "tools/google_apps_script_showtime_signal.gs",
  "tools/google_apps_script_booking_monitor.gs",
  "tools/google_apps_script_quota_benchmark.gs"
];
const fetchBatchSizes=[],logs=[];
let coreReads=0,sideEffects=0;
const mkResponse=(status,data)=>({
  getResponseCode:()=>status,
  getContentText:()=>JSON.stringify(data)
});
const context={
  console:{log:(s)=>logs.push(String(s))},
  PropertiesService:{getScriptProperties(){sideEffects++;throw Error("Benchmark cannot use properties");}},
  LockService:{getScriptLock(){sideEffects++;throw Error("Benchmark cannot use a lock");}},
  MailApp:{sendEmail(){sideEffects++;throw Error("Benchmark cannot email");}},
  UrlFetchApp:{
    fetch(url){
      assert.equal(url,"https://www.pathe.ma/api/show/avengers-doomsday-55389/cinemas");
      coreReads++;
      return mkResponse(200,{});
    },
    fetchAll(group){
      fetchBatchSizes.push(group.length);
      return group.map((request)=>{
        assert.match(request.url,/^https:\/\/www\.pathe\.ma\/api\/show\/avengers-doomsday-55389\/showtimes\/cinema-pathe-californie\/2026-12-\d{2}$/);
        assert.equal(request.headers.Accept,"application/json");
        const date=request.url.slice(-10);
        if(date==="2026-12-27")return mkResponse(404,{error:"unavailable"});
        if(date==="2026-12-28")return mkResponse(503,{error:"maintenance"});
        return mkResponse(200,[]);
      });
    }
  }
};
vm.createContext(context);
for(const file of files) vm.runInContext(fs.readFileSync(file,"utf8"),context);
assert.throws(()=>context.sentinelleBenchmarkReadOnce_(19),/8 or 20/);
const a=context.sentinelleBenchmark8Once();
assert.equal(a.benchmark,"READ_ONLY");
assert.equal(a.dateCount,8);
assert.equal(a.validDetailedDays,8);
assert.equal(a.failedDetailedDays,0);
assert.equal(a.unknownDetailedDays,0);
assert.equal(a.batches.length,1);
assert.equal(a.coreHttpStatus,200);
const b=context.sentinelleBenchmark20Once();
assert.equal(b.dateCount,20);
assert.equal(b.validDetailedDays,18);
assert.equal(b.unknownDetailedDays,1);
assert.equal(b.failedDetailedDays,1);
assert.equal(b.batches.length,3);
assert.deepEqual(fetchBatchSizes,[8,8,8,4]);
assert.equal(coreReads,2);
assert.equal(sideEffects,0);
assert.equal(b.stateWritten,false);
assert.equal(b.triggerCreated,false);
assert.equal(b.notificationSent,false);
assert.equal(b.heartbeatSent,false);
assert.equal(b.statusBreakdown["404"],1);
assert.equal(b.statusBreakdown["503"],1);
assert.ok(logs.every(line=>!line.includes("HC_PING_URL")));
console.log("PASS quota benchmark: 8/20-date batch structure, HTTP classification, no property/queue/email/heartbeat side effects");
