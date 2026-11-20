"use strict";
const assert=require("node:assert/strict");const fs=require("node:fs");const vm=require("node:vm");
const state=new Map();let triggers=[];
const props={getProperty:k=>state.get(k)??null,setProperty:(k,v)=>state.set(k,String(v))};
const trig=h=>({getHandlerFunction:()=>h,getTriggerSource:()=>"CLOCK",getEventType:()=>"CLOCK"});
const env={console:{log(){}},PropertiesService:{getScriptProperties:()=>props},
  ScriptApp:{getProjectTriggers:()=>triggers},Session:{getEffectiveUser:()=>({getEmail:()=>"owner@example.invalid"})},
  MailApp:{getRemainingDailyQuota:()=>97},LockService:{},UrlFetchApp:{}};
vm.createContext(env);
for(const f of ["sentinel","showtime_signal","booking_monitor","watchdog","pilot_metrics","production","deploy_check"])
  vm.runInContext(fs.readFileSync("tools/google_apps_script_"+f+".gs","utf8"),env);
let r=env.sentinelleDeploymentReport();
assert.equal(r.verdict,"NOT_READY");assert.equal(JSON.stringify(r.missingFunctions),JSON.stringify([]));
assert.ok(r.problems.includes("SECRETS_MISSING"));assert.equal(r.executionIdentity,"owner@example.invalid");
state.set("TG_BOT_TOKEN","x");state.set("TG_CHAT_ID","1");state.set("ALERT_EMAIL_TO","a@b.c");
state.set("HC_PING_URL","https://hc-ping.com/12345678-1234-1234-1234-123456789abc");
triggers=[trig("sentinelleInstrumentedPilotCycle")];
r=env.sentinelleDeploymentReport();assert.equal(JSON.stringify(r.problems),JSON.stringify(["EXPIRED_PILOT_TRIGGER_PRESENT"]));
triggers=[];r=env.sentinelleDeploymentReport();assert.equal(r.verdict,"READY_TO_ENABLE");
state.set("DOOMSDAY_PRODUCTION_ENABLED","true");
r=env.sentinelleDeploymentReport();assert.equal(JSON.stringify(r.problems),JSON.stringify(["PRODUCTION_TRIGGER_COUNT_NOT_1"]));
triggers=[trig("sentinelleProductionTick")];r=env.sentinelleDeploymentReport();
assert.equal(r.verdict,"LIVE_CONFIGURATION_OK");assert.equal(r.remainingMailQuota,97);
assert.ok(!JSON.stringify(r).includes("hc-ping.com/1234"),"no secret printed");
// Production end date
state.set("DOOMSDAY_PRODUCTION_UNTIL","2000-01-01T00:00:00Z");
assert.equal(env.sentinelleProductionTick().status,"EXPIRED");
console.log("PASS: deployment report + production end date (offline)");
