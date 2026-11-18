"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
let called=0,read=0,body="OK",http=200,networkError=false,runError=false,configured=true;
const privateUrl="https://hc-ping.com/00000000-0000-0000-0000-000000000001";
let report;
function healthy(){return {cinemaProgramme:"NO_PROGRAMME_FOR_CINEMA",coreErrorType:null,
  datesChecked:8,validDetailedDays:8,unknownDetailedDays:0,failedDetailedDays:0,
  partialDateCoverage:false,datesNotCheckedThisCycle:0,delivery:{pending:0}};}
const c=vm.createContext({console:{log(){}},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>configured?privateUrl:null})},
  UrlFetchApp:{fetch:(url,options)=>{called++;assert.equal(url,privateUrl);assert.equal(options.followRedirects,false);
    if(networkError)throw Error("transport failed "+privateUrl);
    return {getResponseCode:()=>http,getContentText:()=>body};}},
  sentinelleCheckWithBookingOnce:()=>{read++;if(runError)throw Error("failed");return report;}});
vm.runInContext(fs.readFileSync("tools/google_apps_script_watchdog.gs","utf8"),c);
let count=0;function test(name,f){report=healthy();body="OK";http=200;networkError=false;runError=false;configured=true;const prior=called;f(prior);count++;console.log("PASS "+name);}
test("healthy real-shape cycle pings once",before=>{assert.equal(c.sentinelleRunWithWatchdog().watchdog,"ACKNOWLEDGED");assert.equal(called,before+1);});
for(const [name,mutate] of [
 ["unknown API coverage",r=>r.unknownDetailedDays=1],
 ["failed API coverage",r=>r.failedDetailedDays=1],
 ["partially rotated calendar",r=>{r.partialDateCoverage=true;r.datesNotCheckedThisCycle=12;}],
 ["core detector failed",r=>r.coreErrorType="Error"],
 ["pending channel",r=>r.delivery.pending=1],
 ["empty unconfirmed disappearance",r=>r.cinemaProgramme="PENDING_EMPTY_CONFIRMATION"]
])test(name+" withholds heartbeat",before=>{mutate(report);assert.equal(c.sentinelleRunWithWatchdog().watchdog,"WITHHELD");assert.equal(called,before);});
test("thrown monitor error cannot ping from finally",before=>{runError=true;assert.throws(()=>c.sentinelleRunWithWatchdog());assert.equal(called,before);});
test("200 not-found/rate-limit acknowledgements rejected",()=>{for(const x of ["OK (not found)","OK (rate limited)"]){body=x;assert.throws(()=>c.sentinelleRunWithWatchdog());}});
test("transport error never prints private ping URL",()=>{networkError=true;let error;try{c.sentinelleRunWithWatchdog();}catch(e){error=e;}assert.ok(error);assert.equal(error.message.includes(privateUrl),false);});
test("missing config does not skip actual monitoring",before=>{configured=false;const previousReads=read;assert.throws(()=>c.sentinelleRunWithWatchdog());assert.equal(read,previousReads+1);assert.equal(called,before);});
console.log(count+" watchdog checks passed; all services mocked.");

test("safe diagnostics distinguish transport, HTTP and acknowledgement failures",()=>{
  networkError=true;
  assert.throws(()=>c.sentinelleRunWithWatchdog(),/TRANSPORT_ERROR/);
  networkError=false;http=503;
  assert.throws(()=>c.sentinelleRunWithWatchdog(),/HTTP_ERROR/);
  http=200;body="OK (rate limited)";
  assert.throws(()=>c.sentinelleRunWithWatchdog(),/RATE_LIMITED/);
  body="unexpected "+privateUrl;
  assert.throws(()=>c.sentinelleRunWithWatchdog(),e=>/UNEXPECTED_ACK/.test(e.message)&&!e.message.includes(privateUrl));
});
