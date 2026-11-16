/* Real schema fixture plus explicitly synthetic negative/transition mutations. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.join(__dirname,"..");
const c=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,"tools/google_apps_script_showtime_signal.gs"),"utf8"),c);
const real=JSON.parse(fs.readFileSync(path.join(__dirname,"fixtures/pathe_californie_real_showtimes_2026-11-16.json"),"utf8"));
const now="2026-11-16T16:32:02Z";
function run(data=real,time=now){return JSON.parse(JSON.stringify(c.patheShowtimeSignalsV1(data,time)));}
function mutated(patch){return [Object.assign({},real[1],patch)];}
let count=0;function test(name,f){f();count++;console.log("PASS "+name);}
test("real API and verified browser link align",()=>{const s=run();assert.equal(s.length,2);assert.equal(s[1].bookingUrl,"https://s.pathe.ma/fr/V5401S53301/booking");assert.equal(s[1].bookingProposedByApi,true);assert.equal(s[1].localTime,"2026-11-16 22:30:00");});
test("empty detailed array is valid",()=>assert.equal(run([]).length,0));
test("error document is rejected",()=>assert.throws(()=>run({error:"maintenance"})));
test("time alone opens sales despite unchanged metadata",()=>{const data=mutated({reservabilityStart:"2026-11-16T17:00:00Z"});assert.equal(run(data,"2026-11-16T16:59:59Z")[0].bookingProposedByApi,false);assert.equal(run(data,"2026-11-16T17:00:00Z")[0].bookingProposedByApi,true);});
test("end boundary is exclusive",()=>assert.equal(run(mutated({reservabilityEnd:"2026-11-16T16:32:02Z"}))[0].bookingProposedByApi,false));
test("unknown synthetic status cannot assert sales",()=>assert.equal(run(mutated({status:"UNKNOWN_SYNTHETIC_STATUS"}))[0].bookingProposedByApi,false));
test("missing purchase link cannot assert sales",()=>assert.equal(run(mutated({refCmd:null}))[0].bookingProposedByApi,false));
test("wrong host and wrong cinema links rejected",()=>{assert.throws(()=>run(mutated({refCmd:"https://evil.example/fr/V5401S53301/booking"})));assert.throws(()=>run(mutated({refCmd:"https://s.pathe.ma/fr/V9999S53301/booking"})));});
test("no implicit host timezone for sales window",()=>assert.throws(()=>run(mutated({reservabilityStart:"2026-11-16T10:00:00"}))));
test("reversed window rejected",()=>assert.throws(()=>run(mutated({reservabilityStart:"2026-12-16T10:00:00Z"}))));
test("ordering and duplicate tags do not change snapshot",()=>assert.deepEqual(run(),run([...real].reverse().map(s=>({...s,tags:["pmr","DEFAULT","pmr"]})))));
test("duplicate identities rejected",()=>assert.throws(()=>run([real[0],real[0]])));
test("observed IMAX slug does not imply Laser or seats",()=>{const s=run(mutated({tags:["imax"]}))[0];assert.equal(s.imaxByTag,true);assert.equal(s.imaxLaserConfirmed,false);assert.equal(s.seatsKnown,false);assert.equal(run(mutated({tags:["vip_fr","PREMIUM"]}))[0].imaxByTag,false);});
test("malformed local date and window rejected",()=>{assert.throws(()=>run(mutated({time:"2026-02-30 22:30:00"})));assert.throws(()=>run(mutated({reservabilityEnd:null})));});
console.log(count+" showtime signal checks passed; no network or notifications.");
