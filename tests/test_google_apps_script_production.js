"use strict";
const assert=require("node:assert/strict");
const vm=require("node:vm"),fs=require("node:fs");
const state=new Map();
let runs=0, notifications=0, heartbeats=0, triggers=0;
const env={
  console:{log(){}},
  PropertiesService:{getScriptProperties(){return {
    getProperty(k){return state.get(k)??null;}
  };}},
  DOOMSDAY_SENTINEL:{lastOkKey:"DOOMSDAY_MONITOR_LAST_OK_V1"},
  DOOMSDAY_BOOKING_V1:{lastDetailOk:"DOOMSDAY_DETAIL_LAST_OK_V1"},
  sentinelleInstrumentedRun_(fn){runs++;return fn();},
  sentinelleRunWithWatchdog(){heartbeats++;return {watchdog:"ACKNOWLEDGED",report:{datesChecked:8}};}
};
vm.createContext(env);
vm.runInContext(fs.readFileSync("tools/google_apps_script_production.gs","utf8"),env);
assert.equal(env.sentinelleProductionStatus().enabled,false);
const off=env.sentinelleProductionTick();
assert.equal(off.status,"DISABLED");
assert.equal(off.triggerCreated,false);
assert.equal(runs,0);
assert.equal(heartbeats,0);
state.set("DOOMSDAY_PRODUCTION_ENABLED","TRUE"); // no loose truthy coercion
assert.equal(env.sentinelleProductionTick().status,"DISABLED");
assert.equal(runs,0);
state.set("DOOMSDAY_PRODUCTION_ENABLED","true");
state.set("DOOMSDAY_MONITOR_LAST_OK_V1","2026-11-18T22:00:00Z");
state.set("DOOMSDAY_DETAIL_LAST_OK_V1","2026-11-18T22:00:01Z");
const status=env.sentinelleProductionStatus();
assert.equal(status.enabled,true);
assert.equal(status.coreLastOkUtc,"2026-11-18T22:00:00Z");
assert.equal(status.detailLastOkUtc,"2026-11-18T22:00:01Z");
const on=env.sentinelleProductionTick();
assert.equal(on.watchdog,"ACKNOWLEDGED");
assert.equal(runs,1);
assert.equal(heartbeats,1);
assert.equal(notifications,0);
assert.equal(triggers,0);
assert.equal(state.size,3);
console.log("PASS production entrypoint requires explicit enable flag and bypasses expired pilot");
