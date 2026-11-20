"use strict";
const assert=require("node:assert/strict");const fs=require("node:fs");const vm=require("node:vm");
const crypto=require("node:crypto");const path=require("node:path");
const fpTool=require("../tools/compute_code_fingerprint.js");
const root=path.resolve(__dirname,"..");
const J=x=>JSON.stringify(x);

/* 1. Fingerprint integrity: the embedded value matches the committed code,
      and the hashed list covers every top-level function of the 7 files. */
const fresh=fpTool.load(root);
assert.equal(fresh.sentinelleCodeFingerprint_(),fresh.DOOMSDAY_DEPLOY_EXPECTED.fingerprint,
  "Code changed: run `node tools/compute_code_fingerprint.js` and update DOOMSDAY_DEPLOY_EXPECTED.fingerprint");
assert.equal(J(Array.from(fresh.DOOMSDAY_DEPLOY_EXPECTED.fingerprintFunctions)),J(fpTool.topLevelFunctions(root)),
  "fingerprintFunctions must list every top-level function of the 7 files, in file order");
console.log("PASS fingerprint "+fresh.DOOMSDAY_DEPLOY_EXPECTED.fingerprint);

/* 2. Tampering with one character of one deployed file is detected. */
const tmp=fs.mkdtempSync(path.join(require("node:os").tmpdir(),"fp-"));
fs.mkdirSync(path.join(tmp,"tools"));
for(const f of fpTool.FILES){const n="google_apps_script_"+f+".gs";fs.copyFileSync(path.join(root,"tools",n),path.join(tmp,"tools",n));}
const target=path.join(tmp,"tools","google_apps_script_showtime_signal.gs");
fs.writeFileSync(target,fs.readFileSync(target,"utf8").replace('s.status === "available"','s.status === "Available"'));
assert.notEqual(fpTool.load(tmp).sentinelleCodeFingerprint_(),fresh.DOOMSDAY_DEPLOY_EXPECTED.fingerprint);
// CRLF / trailing spaces introduced by an editor copy are NOT a difference.
const crlf=path.join(tmp,"tools","google_apps_script_sentinel.gs");
fs.copyFileSync(path.join(root,"tools","google_apps_script_showtime_signal.gs"),target);
fs.writeFileSync(crlf,fs.readFileSync(crlf,"utf8").replace(/\n/g,"  \r\n"));
assert.equal(fpTool.load(tmp).sentinelleCodeFingerprint_(),fresh.DOOMSDAY_DEPLOY_EXPECTED.fingerprint);
console.log("PASS tamper detected; CRLF/trailing spaces tolerated");

/* 3. Deployment report verdicts with mocked Google services. */
const state=new Map();let triggers=[],deleted=[],me="owner@example.invalid",fetches=[],sentTg=0,sentMail=0;
const props={getProperty:k=>state.get(k)??null,setProperty:(k,v)=>state.set(k,String(v))};
const trig=(h,uid)=>({getHandlerFunction:()=>h,getTriggerSource:()=>"CLOCK",getEventType:()=>"CLOCK",getUniqueId:()=>uid});
const ok=(code,body)=>({getResponseCode:()=>code,getContentText:()=>JSON.stringify(body)});
const env={console:{log(){}},PropertiesService:{getScriptProperties:()=>props},
  ScriptApp:{getProjectTriggers:()=>triggers,deleteTrigger:t=>{deleted.push(t.getUniqueId());triggers=triggers.filter(x=>x!==t);}},
  Session:{getEffectiveUser:()=>({getEmail:()=>me})},
  MailApp:{getRemainingDailyQuota:()=>97,sendEmail(){sentMail++;}},
  LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock(){}}),getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  UrlFetchApp:{fetch(url,o){fetches.push([url,o]);if(url.includes("api.telegram.org")){sentTg++;return ok(200,{ok:true,result:{}});}return ok(200,{});}},
  Utilities:{DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},
    computeDigest:(_a,t)=>Array.from(crypto.createHash("sha256").update(t,"utf8").digest()).map(b=>b>127?b-256:b)}};
vm.createContext(env);
for(const f of fpTool.FILES)vm.runInContext(fs.readFileSync(path.join(root,"tools","google_apps_script_"+f+".gs"),"utf8"),env);
const run=()=>env.sentinelleDeploymentReport();
let r=run();
assert.equal(r.verdict,"NOT_READY");assert.ok(r.problems.includes("SECRETS_MISSING"));
assert.equal(r.codeFingerprintInstalled,r.codeFingerprintExpected);
state.set("TG_BOT_TOKEN","x");state.set("TG_CHAT_ID","1");state.set("ALERT_EMAIL_TO","a@b.c");
state.set("HC_PING_URL","https://hc-ping.com/12345678-1234-1234-1234-123456789abc");
triggers=[trig("sentinelleInstrumentedPilotCycle","p1")];
assert.equal(J(run().problems),J(["EXPIRED_PILOT_TRIGGER_PRESENT"]));
triggers=[];assert.equal(run().verdict,"READY_TO_ENABLE");
state.set("DOOMSDAY_PRODUCTION_ENABLED","true");
assert.equal(J(run().problems),J(["PRODUCTION_TRIGGER_COUNT_NOT_1"]));
triggers=[trig("sentinelleProductionTick","t-own")];
r=run();assert.equal(r.verdict,"ENABLED_AWAITING_EVIDENCE");assert.equal(J(r.pendingEvidence),J(["NO_AUTOMATIC_RUN_YET"]));
assert.ok(!J(r).includes("hc-ping.com/1234"),"no secret printed");

/* 4. Only an AUTOMATIC run (event with triggerUid) is recorded as evidence. */
const record=(uid,who,ack,ageMin=1)=>state.set("DOOMSDAY_LAST_AUTOMATIC_RUN_V1",J({atUtc:new Date(Date.now()-ageMin*60000).toISOString(),
  triggerUid:uid,identity:who,fingerprint:r.codeFingerprintInstalled,watchdog:ack}));
env.sentinelleRecordAutomaticRun_(props,undefined,{watchdog:"ACKNOWLEDGED"});
assert.equal(state.get("DOOMSDAY_LAST_AUTOMATIC_RUN_V1"),undefined,"manual run is not evidence");
env.sentinelleRecordAutomaticRun_(props,{triggerUid:"t-own"},{watchdog:"ACKNOWLEDGED"});
r=run();assert.equal(r.verdict,"LIVE_VERIFIED");assert.equal(r.lastAutomaticRun.identity,me);
record("t-own",me,"WITHHELD");assert.equal(J(run().pendingEvidence),J(["LAST_AUTOMATIC_RUN_WATCHDOG_WITHHELD"]));
record("t-other",me,"ACKNOWLEDGED");assert.ok(run().problems.includes("AUTOMATIC_RUN_FROM_A_TRIGGER_NOT_OWNED_BY_THIS_ACCOUNT"));
record("t-own","someone-else@example.invalid","ACKNOWLEDGED");assert.ok(run().problems.includes("AUTOMATIC_RUN_IDENTITY_DIFFERS_FROM_REPORT_RUNNER"));
record("t-own",me,"ACKNOWLEDGED",40);assert.ok(run().problems.includes("LAST_AUTOMATIC_RUN_STALE"));
console.log("PASS deployment report verdicts and trigger-ownership evidence");

/* 5. End of service: one closeout (notice + HC pause + own trigger deleted), then silent. */
state.set("HC_API_KEY","test-key");state.set("DOOMSDAY_PRODUCTION_UNTIL","2000-01-01T00:00:00Z");
fetches=[];const tg0=sentTg,mail0=sentMail;
let c=env.sentinelleProductionTick({triggerUid:"t-own"});
assert.equal(c.status,"CLOSED_OUT");assert.equal(c.healthchecksPaused,true);assert.equal(c.triggersDeleted,1);
assert.equal(J(deleted),J(["t-own"]));assert.equal(sentTg,tg0+1);assert.equal(sentMail,mail0+1);
const pause=fetches.find(([u])=>u.includes("healthchecks.io"));
assert.equal(pause[0],"https://healthchecks.io/api/v3/checks/12345678-1234-1234-1234-123456789abc/pause");
assert.equal(pause[1].headers["X-Api-Key"],"test-key");
assert.ok(!fetches.some(([u])=>u.includes("pathe.ma")),"no Pathé read after the end date");
c=env.sentinelleProductionTick({triggerUid:"t-own"});
assert.equal(c.status,"EXPIRED");assert.equal(sentTg,tg0+1,"closeout notice sent once");
state.delete("HC_API_KEY");state.delete("DOOMSDAY_PRODUCTION_CLOSEOUT_V1");triggers=[trig("sentinelleProductionTick","t2")];
c=env.sentinelleProductionTick({});assert.equal(c.healthchecksPaused,false,"without key: notice tells the user to pause");
console.log("PASS end-of-service closeout (once, own trigger deleted, Healthchecks paused when key present)");
