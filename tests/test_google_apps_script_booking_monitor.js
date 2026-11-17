"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const state=new Map();
let cinemaResponse={};
const details=new Map();
let tg=0, mail=0, bodyByChannel=[];
const props={
  getProperty(k){return state.get(k)??null;},
  setProperty(k,v){state.set(k,String(v));}
};
state.set("TG_BOT_TOKEN","TEST_ONLY");
state.set("TG_CHAT_ID","1234567");
state.set("ALERT_EMAIL_TO","test@example.invalid");
const nowBefore="2026-11-17T09:59:59Z";
const nowAfter="2026-11-17T10:00:00Z";
const sessionDate="2026-12-16";
const prefix="/api/show/avengers-doomsday-55389/showtimes/cinema-pathe-californie/";
const cinemaPath="/api/show/avengers-doomsday-55389/cinemas";
function response(code,payload){
  return {getResponseCode(){return code;},getContentText(){return JSON.stringify(payload);}};
}
const env={
 console:{log(){}},
 LockService:{getScriptLock(){return {tryLock(){return true;},releaseLock(){}};}},
 PropertiesService:{getScriptProperties(){return props;}},
 UrlFetchApp:{fetch(url,options){
   if(url.includes("api.telegram.org")){
     tg++;bodyByChannel.push(["telegram",JSON.parse(options.payload).text]);
     return response(200,{ok:true});
   }
   if(url.endsWith(cinemaPath))return response(200,cinemaResponse);
   if(url.includes(prefix)){
     const date=url.split("/").pop();
     const target=details.get(date) || {status:200,data:[]};
     return response(target.status,target.data);
   }
   throw Error("Unexpected URL: "+url);
 }},
 MailApp:{sendEmail(x){mail++;bodyByChannel.push(["gmail",x.body]);}}
};
vm.createContext(env);
for(const path of ["tools/google_apps_script_sentinel.gs","tools/google_apps_script_showtime_signal.gs","tools/google_apps_script_booking_monitor.gs"]){
  vm.runInContext(fs.readFileSync(path,"utf8"),env);
}
const p=(status,data)=>details.set(sessionDate,{status,data});
const session={
  time:"2026-12-16 20:30:00",version:"vostfr-ma",tags:["DEFAULT"],
  status:"available",reservabilityStart:"2026-11-17T10:00:00+00:00",
  reservabilityEnd:"2026-12-16T21:00:00+00:00",refCmd:"https://s.pathe.ma/fr/V98765S70001/booking",
  auditoriumName:"IMAX",auditoriumCapacity:"200",isMovie:true
};
function test(label,callback){callback();console.log("PASS "+label);}
test("absence of cinema date does not prevent anchor detailed monitoring",()=>{
  p(200,[]);
  const x=env.sentinelleCheckWithBookingOnce(nowBefore);
  assert.equal(x.cinemaProgramme,"NO_PROGRAMME_FOR_CINEMA");
  assert.equal(x.datesChecked,8);
  assert.equal(x.validDetailedDays,3);
  assert.equal(x.newReservableSessions,0);
  assert.equal(tg,0);
  assert.equal(mail,0);
});
test("pre-opening details do not create booking alerts",()=>{
  p(200,[session]);
  let x=env.sentinelleCheckWithBookingOnce(nowBefore);
  assert.equal(x.newReservableSessions,0);
  assert.equal(mail,0);
});
test("opening instant with identical cinema API and detailed metadata alerts once",()=>{
  const x=env.sentinelleCheckWithBookingOnce(nowAfter);
  assert.equal(x.newReservableSessions,1);
  assert.equal(mail,1);assert.equal(tg,1);
  assert.match(bodyByChannel[0][1],/V98765S70001\/booking/);
  assert.match(bodyByChannel[0][1],/ne garantit pas de places/);
});
test("same open session does not trigger duplicate channel sends",()=>{
  let x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:05:00Z");
  assert.equal(x.newReservableSessions,0);
  assert.equal(mail,1);assert.equal(tg,1);
});
test("one unavailable detail endpoint never converts to closed or creates false alert",()=>{
  p(503,{error:"maintenance"});
  const x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:10:00Z");
  assert.equal(x.failedDetailedDays,1);
  const persisted=JSON.parse(state.get("DOOMSDAY_DETAIL_STATE_V1_"+sessionDate));
  assert.equal(persisted[0].open,true);
  assert.equal(mail,1);assert.equal(tg,1);
});
test("HTTP 404 is unknown rather than valid no sessions",()=>{
  p(404,{error:"not yet indexed"});
  let x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:11:00Z");
  assert.equal(x.unknownDetailedDays,1);
  assert.equal(x.newReservableSessions,0);
  assert.equal(mail,1);assert.equal(tg,1);
});
test("malformed link fails closed and preserves old state",()=>{
  p(200,[{...session,refCmd:"https://external.bad/phishing"}]);
  let x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:12:00Z");
  assert.equal(x.failedDetailedDays,1);
  assert.equal(mail,2);assert.equal(tg,2); // 3 consecutive degradation checks emitted health warning
  assert.equal(JSON.parse(state.get("DOOMSDAY_DETAIL_STATE_V1_"+sessionDate))[0].open,true);
});
test("IMAX tag appearance is new actionable metadata without asserting Laser",()=>{
  p(200,[{...session,tags:["imax","DEFAULT"]}]);
  let x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:13:00Z");
  assert.equal(x.newReservableSessions,1);
  assert.equal(mail,3);assert.equal(tg,3);
  const msg=bodyByChannel[bodyByChannel.length-1][1];
  assert.match(msg,/IMAX \(Laser non confirmé\)/);
});
test("another identical IMAX polling cycle is quiet",()=>{
  let x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:14:00Z");
  assert.equal(x.newReservableSessions,0);assert.equal(mail,3);assert.equal(tg,3);
});
test("large calendars are rotated rather than stopping the whole monitor",()=>{
  const dates=[];
  for(let i=1;i<=28;i++)dates.push({date:"2026-11-"+String(i).padStart(2,"0")});
  const selected=new Set();
  let partial=0;
  for(let cycle=0;cycle<5;cycle++){
    const observed=env.sentinelleDetailedDates_({days:dates},props);
    assert.ok(observed.length<=20);
    assert.equal(observed.totalDates,36);
    assert.ok(observed.skippedDates>0);
    partial++;
    observed.forEach(d=>selected.add(d));
  }
  assert.ok(partial>=1);
  dates.forEach(d=>assert.ok(selected.has(d.date),"missed "+d.date));
  assert.ok(selected.has("2026-12-15"),"preview anchor must be monitored");
});
console.log("PASS: 10 detailed booking integration checks (offline; no real notifications)");
