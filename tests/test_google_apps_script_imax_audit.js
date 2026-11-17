"use strict";
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const source=fs.readFileSync("tools/google_apps_script_imax_audit.gs","utf8");

function caseRun({filmTags,roomName,status,expectMode}) {
  const films=[{slug:"movie-control-1",title:"Témoin 1"},{slug:"movie-control-2",title:"Témoin 2"}];
  let calls=0;
  const record=(x)=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(x)});
  const cinemas={
    "cinema-pathe-californie":{days:{
      "2026-12-16":{versions:["vf-ma"],tags:filmTags}
    }}
  };
  const app={
    console:{log(){}},
    UrlFetchApp:{
      fetch(url){
        assert.equal(url,"https://www.pathe.ma/api/shows");
        return record({shows:films});
      },
      fetchAll(requests){
        calls++;
        assert.ok(requests.length<=8 || calls===1);
        if(calls===1) {
          assert.equal(requests.length,2);
          return requests.map(()=>record(cinemas));
        }
        return requests.map(()=>record([
          {time:"2026-12-16 20:30:00",version:"vf-ma",status,
            tags:filmTags,auditoriumName:roomName,
            refCmd:null,reservabilityStart:null,reservabilityEnd:null}
        ]));
      }
    },
    patheShowtimeSignalsV1(){throw Error("Deliberate strict classifier failure");}
  };
  vm.createContext(app);
  vm.runInContext(source,app);
  const out=app.sentinelleAuditImaxOnce();
  assert.equal(out.discoveryMode,expectMode);
  assert.equal(out.filmsChecked,2);
  assert.equal(out.detailDatesChecked,expectMode==="day_tags"?2:2);
  assert.equal(out.detailedRowsExamined,2);
  assert.ok(out.errors.length===0,JSON.stringify(out.errors));
  assert.equal(out.notificationsSent,0);
  assert.equal(out.heartbeatSent,false);
  return out;
}

// Critical bias regression: day-level tags do not mention IMAX, but the
// detailed session still reveals an IMAX room. The prior audit made ZERO
// detailed calls and would have missed the clue.
const a=caseRun({
  filmTags:["DEFAULT"],roomName:"Salle IMAX",status:"soon",
  expectMode:"fallback_detail_sample"
});
assert.equal(a.imaxFilmDates,0);
assert.ok(a.sessions.length>=1);
assert.equal(a.sessions[0].imaxLaserConfirmed,false);
assert.equal(a.sessions[0].apiProposed,false);
assert.ok(a.observedAuditoriumNames.includes("Salle IMAX"));
console.log("PASS: fallback detail probe can identify IMAX room without calendar tag");

// Normal positive: tagged calendar uses the targeted detailed sampling mode.
const b=caseRun({
  filmTags:["imax"],roomName:"Salle IMAX",status:"available",
  expectMode:"day_tags"
});
assert.equal(b.imaxFilmDates,2);
assert.ok(b.sessions.length>=1);
assert.equal(b.sessions[0].apiProposed,false); // strict classifier intentionally rejected null sale window
console.log("PASS: tagged IMAX candidate mode and no fabricated commercial signal");
