const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
let p=new Map(),n=0,unlocked=0;
const props={getProperty:k=>p.get(k)??null,setProperty:(k,v)=>p.set(k,v)};
const c=vm.createContext({Date,console,PropertiesService:{getScriptProperties:()=>props},
LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock:()=>unlocked++})},
sentinelleHealthyForWatchdog_:r=>!!r&&r.ok===true,
sentinelleCheckWithBookingOnce:()=>({ok:true,datesChecked:8,delivery:{pending:0}}),
sentinelleRunWithWatchdog:()=>{n++;return {report:{ok:true},watchdog:"ACKNOWLEDGED"};}});
vm.runInContext(fs.readFileSync("tools/google_apps_script_pilot_metrics.gs","utf8"),c);
const start=Date.parse("2026-11-17T00:00:00Z");
for(let i=0;i<289;i++)c.sentinelleMetricsRecord_(props,{t:start+i*300000,ms:1000+i,h:i%10?1:0,d:8,f:0,u:0,p:0,e:null});
let s=c.sentinelleMetricsSummary_(props,start+288*300000);
assert.equal(s.samplesInLast24h,288);assert.equal(s.totalSamplesRecorded,289);
assert.equal(s.firstSampleUtc,new Date(start+300000).toISOString());
assert.equal(s.maxObservedGapSeconds,300);assert.equal(s.p95DurationMs,1274);
assert.equal(p.size,7);for(const [k,v] of p)if(k.includes("CHUNK"))assert.ok(v.length<=7000);
assert.equal(c.sentinelleMetricsSummary_(props,start+3*86400000).samplesInLast24h,0);
assert.equal(c.sentinelleMetricsSummary_(props,start+3*86400000).p95DurationMs,null);
c.sentinelleInstrumentedCheckOnce();assert.equal(n,0);assert.equal(unlocked,1);
assert.throws(()=>c.sentinelleInstrumentedRun_(()=>{throw new TypeError("private URL");}),/sample recorded/);
assert.equal(unlocked,2);assert.equal(JSON.stringify([...p]).includes("private URL"),false);
p.set("DOOMSDAY_METRICS_V1_COUNT","bad");
assert.throws(()=>c.sentinelleMetricsSummary_(props,Date.now()),/count invalid/);
console.log("PASS rollover retains 288 samples; bounded storage; stale filtering; p95; no manual heartbeat; failure recording; lock release");
