"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const state=new Map();
let cinemaResponse={};
const details=new Map();
const batches=[];
let failBatch=false;
let tg=0, mail=0, reminders=0, bodyByChannel=[], reminderBodies=[], updates=[];
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
 UrlFetchApp:{fetchAll(requests){
   batches.push(requests.map(r=>r.url.split("/").pop()));
   if(failBatch) throw Error("simulated batch transport failure");
   return requests.map(({url,...options})=>this.fetch(url,options));
 },fetch(url,options){
   if(url.includes("api.telegram.org")){
     const method=url.split("/").pop();
     if(method==="getUpdates")return response(200,{ok:true,result:updates});
     if(method==="answerCallbackQuery")return response(200,{ok:true,result:true});
     const payload=JSON.parse(options.payload);
     if(payload.reply_markup){reminders++;reminderBodies.push(payload);}
     else {tg++;bodyByChannel.push(["telegram",payload.text]);}
     return response(200,{ok:true,result:{message_id:1}});
   }
   if(url.endsWith(cinemaPath))return response(200,cinemaResponse);
   if(url.includes(prefix)){
     const date=url.split("/").pop();
     const target=details.get(date) || {status:200,data:[]};
     return response(target.status,target.data);
   }
   throw Error("Unexpected URL: "+url);
 }},
 MailApp:{sendEmail(x){mail++;bodyByChannel.push(["gmail",x.body,x.subject]);}}
};
vm.createContext(env);
for(const path of ["tools/google_apps_script_sentinel.gs","tools/google_apps_script_showtime_signal.gs","tools/google_apps_script_booking_monitor.gs"]){
  vm.runInContext(fs.readFileSync(path,"utf8"),env);
}
const p=(status,data,date=sessionDate)=>details.set(date,{status,data});
const session={
  time:"2026-12-16 20:30:00",version:"vostfr-ma",tags:["DEFAULT"],
  status:"available",reservabilityStart:"2026-11-17T10:00:00+00:00",
  reservabilityEnd:"2026-12-16T21:00:00+00:00",refCmd:"https://s.pathe.ma/fr/V98765S70001/booking",
  auditoriumName:"IMAX",auditoriumCapacity:"200",isMovie:true
};
const lastMail=()=>bodyByChannel.filter(x=>x[0]==="gmail").pop();
const critical=()=>JSON.parse(state.get("DOOMSDAY_CRITICAL_REMINDER_V1"));
function test(label,callback){callback();console.log("PASS "+label);}
test("absence of cinema date does not prevent anchor detailed monitoring",()=>{
  p(200,[]);
  const x=env.sentinelleCheckWithBookingOnce(nowBefore);
  assert.equal(x.cinemaProgramme,"NO_PROGRAMME_FOR_CINEMA");
  assert.equal(x.datesChecked,8);
  assert.equal(x.validDetailedDays,8);
  assert.equal(x.newReservableSessions,0);
  assert.equal(tg,0);
  assert.equal(mail,0);
});
test("sessions published before sales open: early notice with Casablanca opening time",()=>{
  p(200,[session]);
  const x=env.sentinelleCheckWithBookingOnce(nowBefore);
  assert.equal(x.newReservableSessions,0);
  assert.equal(x.newlyListedSessions,1);
  assert.equal(mail,1);assert.equal(tg,1);
  assert.match(lastMail()[1],/SÉANCES PUBLIÉES/);
  assert.match(lastMail()[1],/2026-11-17 11:00 \(heure de Casablanca\)/);
  assert.equal(state.get("DOOMSDAY_CRITICAL_REMINDER_V1")??null,null,"a notice is not critical");
});
test("opening instant with identical metadata alerts once and arms the reminder",()=>{
  const x=env.sentinelleCheckWithBookingOnce(nowAfter);
  assert.equal(x.newReservableSessions,1);
  assert.equal(x.newlyListedSessions,0);
  assert.equal(mail,2);assert.equal(tg,2);
  assert.match(lastMail()[1],/V98765S70001\/booking/);
  assert.match(lastMail()[1],/ne garantit pas de places/);
  assert.equal(x.criticalReminder,"WAITING");
  assert.equal(reminders,0);
});
test("next cycle re-sends on Telegram with an acknowledgement button, no duplicate main alert",()=>{
  const x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:05:00Z");
  assert.equal(x.newReservableSessions,0);
  assert.equal(mail,2);assert.equal(tg,2);
  assert.equal(x.criticalReminder,"REMINDED");
  assert.equal(reminders,1);
  assert.match(reminderBodies[0].text,/RAPPEL 1\/12/);
  assert.equal(reminderBodies[0].reply_markup.inline_keyboard[0][0].callback_data,"seen:"+critical().nonce);
});
test("tapping J'ai vu stops reminders; a 503 never converts to closed",()=>{
  updates.push({update_id:1,callback_query:{id:"cb1",data:"seen:"+critical().nonce,from:{id:1234567}}});
  p(503,{error:"maintenance"});
  const x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:10:00Z");
  assert.equal(x.failedDetailedDays,1);
  assert.equal(x.criticalReminder,"ACKNOWLEDGED");
  assert.equal(reminders,1);
  const persisted=JSON.parse(state.get("DOOMSDAY_DETAIL_STATE_V1_"+sessionDate));
  assert.equal(persisted[0].open,true);
  assert.equal(mail,2);assert.equal(tg,2);
});
test("HTTP 404 is unknown rather than valid no sessions",()=>{
  p(404,{error:"not yet indexed"});
  let x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:11:00Z");
  assert.equal(x.unknownDetailedDays,1);
  assert.equal(x.newReservableSessions,0);
  assert.equal(x.criticalReminder,"NONE");
  assert.equal(mail,2);assert.equal(tg,2);
});
test("unreadable rows alert IMMEDIATELY (fail-open), once, and arm the reminder",()=>{
  p(200,[{...session,time:"2026-02-30 20:30:00"}]);
  let x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:12:00Z");
  assert.equal(x.anomalyDetailedDays,1);
  // anomaly alert + the 3rd-consecutive "couverture dégradée" health alert
  assert.equal(mail,4);assert.equal(tg,4);
  assert.ok(bodyByChannel.some(m=>m[0]==="gmail"&&/contenu inattendu/.test(m[2])));
  assert.equal(critical().acked,false);
  x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:17:00Z");
  assert.equal(mail,4,"anomaly alert is not repeated by e-mail");
  assert.equal(x.criticalReminder,"REMINDED");
  assert.equal(reminders,2);
  assert.equal(JSON.parse(state.get("DOOMSDAY_DETAIL_STATE_V1_"+sessionDate))[0].open,true,"old state kept");
});
test("untrusted link is hidden but the session is still announced; any reply acknowledges",()=>{
  updates.push({update_id:2,message:{chat:{id:1234567},text:"ok",date:Date.parse("2026-11-17T10:20:00Z")/1000}});
  p(200,[{...session,refCmd:"https://external.bad/phishing"}]);
  const x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:22:00Z");
  assert.equal(x.failedDetailedDays,0);
  assert.equal(x.newlyListedSessions,1);
  assert.equal(x.criticalReminder,"ACKNOWLEDGED");
  assert.equal(mail,5);assert.equal(tg,5);
  assert.doesNotMatch(lastMail()[1],/external\.bad/);
  assert.match(lastMail()[1],/hors domaine Pathé a été ignoré/);
  assert.equal(state.get("DOOMSDAY_DETAIL_ANOMALY_V1_"+sessionDate),"","anomaly flag cleared on a valid read");
});
test("IMAX booking session alerts without asserting Laser",()=>{
  p(200,[{...session,tags:["imax","DEFAULT"]}]);
  let x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:23:00Z");
  assert.equal(x.newReservableSessions,1);
  assert.equal(mail,6);assert.equal(tg,6);
  assert.match(lastMail()[1],/IMAX \(Laser non confirmé\)/);
});
test("another identical IMAX polling cycle is quiet",()=>{
  let x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:24:00Z");
  assert.equal(x.newReservableSessions,0);assert.equal(mail,6);assert.equal(tg,6);
});
test("release-day volume (60 sessions on one date) is stored, not rejected",()=>{
  const many=Array.from({length:60},(_,i)=>({...session,time:"2026-12-17 "+String(10+Math.floor(i/5)).padStart(2,"0")+":"+String((i%5)*10).padStart(2,"0")+":00",
    refCmd:"https://s.pathe.ma/fr/V98765S"+(80000+i)+"/booking"}));
  p(200,many,"2026-12-17");
  const x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:25:00Z");
  assert.equal(x.failedDetailedDays,0);
  assert.equal(x.newReservableSessions,60);
  assert.equal(JSON.parse(state.get("DOOMSDAY_DETAIL_STATE_V1_2026-12-17")).length,60);
  assert.equal(mail,7);
});
test("after-midnight session listed under the previous day is kept",()=>{
  p(200,[{...session,time:"2026-12-16 00:01:00",refCmd:"https://s.pathe.ma/fr/V98765S90001/booking"}],"2026-12-15");
  const x=env.sentinelleCheckWithBookingOnce("2026-11-17T10:26:00Z");
  assert.equal(x.failedDetailedDays,0);
  assert.equal(x.newReservableSessions,1);
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
console.log("PASS: detailed booking integration checks (offline; no real notifications)");

test("20 dates use three batches and keep the eight anchors in the first",()=>{
  const extra=Array.from({length:12},(_,i)=>"2026-11-"+String(i+1).padStart(2,"0"));
  const selected=env.sentinelleDetailedDates_({days:extra.map(date=>({date}))},props);
  assert.equal(selected.length,20);
  const archiveKey=env.DOOMSDAY_SENTINEL.stateKey;
  const originalCore=env.sentinelleCheckOnce;
  env.sentinelleCheckOnce=()=>{props.setProperty(archiveKey,JSON.stringify({days:extra.map(date=>({date}))}));return {status:"DATES_PROGRAMMED"};};
  batches.length=0;
  try {
    const result=env.sentinelleCheckWithBookingOnce(nowAfter);
    assert.equal(result.validDetailedDays,20);
    assert.deepEqual(batches.map(x=>x.length),[8,8,4]);
    assert.equal(JSON.stringify(batches[0]),JSON.stringify(env.DOOMSDAY_BOOKING_V1.anchorDates));
    failBatch=true;
    const failed=env.sentinelleCheckWithBookingOnce(nowAfter);
    assert.equal(failed.validDetailedDays,0);
    assert.equal(failed.failedDetailedDays,20);
    assert.ok(failed.errors.every(e=>e.errorType==="DetailBatchFetchError"));
  } finally {failBatch=false;env.sentinelleCheckOnce=originalCore;}
});
