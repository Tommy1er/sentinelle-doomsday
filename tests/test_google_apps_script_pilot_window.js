const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
let state=new Map(),checks=0,queued=0,flushed=0;
let now=Date.parse("2026-11-17T22:00:00Z");
class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
const props={getProperty:k=>state.get(k)??null,setProperty:(k,v)=>state.set(k,v)};
const c=vm.createContext({Date:Clock,console:{log(){}},PropertiesService:{getScriptProperties:()=>props},
LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock(){}})},
sentinelleHealthyForWatchdog_:r=>!!r&&r.ok,
sentinelleCheckWithBookingOnce:()=>({ok:true,datesChecked:8,delivery:{pending:0}}),
sentinelleRunWithWatchdog:()=>{checks++;return{report:{ok:true,datesChecked:8,delivery:{pending:0}},watchdog:"ACKNOWLEDGED"};},
sentinelleEnqueue_:()=>queued++,sentinelleFlushOutbox_:()=>{flushed++;return{pending:0};}});
vm.runInContext(fs.readFileSync("tools/google_apps_script_pilot_metrics.gs","utf8"),c);
assert.throws(()=>c.sentinelleInstrumentedPilotCycle(),/not prepared/);
assert.throws(()=>c.sentinellePreparePilot24h(),/acknowledgement required/);
state.set("DOOMSDAY_RECEIPT_TEST_V1",JSON.stringify({acknowledged:true}));
c.sentinellePreparePilot24h();assert.equal(checks,0);
assert.throws(()=>c.sentinellePreparePilot24h(),/already exists/);
c.sentinelleInstrumentedPilotCycle();assert.equal(checks,1);
const w=JSON.parse(state.get("DOOMSDAY_PILOT_WINDOW_V1"));
assert.equal(Date.parse(w.endsAtUtc)-Date.parse(w.startedAtUtc),86400000);
now+=86400000-1;c.sentinelleInstrumentedPilotCycle();assert.equal(checks,2);
now++;c.sentinelleInstrumentedPilotCycle();assert.equal(checks,2);assert.equal(queued,1);
now+=300000;c.sentinelleInstrumentedPilotCycle();assert.equal(checks,2);assert.equal(queued,1);assert.equal(flushed,2);
assert.equal(JSON.parse(state.get("DOOMSDAY_PILOT_WINDOW_V1")).status,"EXPIRED");
console.log("PASS acknowledged preflight, one window, exact 24h boundary, no Pathé/heartbeat after expiry, end notice once and delivery retry");
