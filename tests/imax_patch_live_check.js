"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const state=new Map();let mails=[],tg=[],reminders=0;
const props={getProperty:k=>state.get(k)??null,setProperty:(k,v)=>state.set(k,String(v))};
state.set("TG_BOT_TOKEN","T");state.set("TG_CHAT_ID","1");state.set("ALERT_EMAIL_TO","a@b.c");
const details=new Map();let cinema={};
const R=(c,p)=>({getResponseCode:()=>c,getContentText:()=>JSON.stringify(p)});
const env={console:{log(){}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 PropertiesService:{getScriptProperties:()=>props},
 UrlFetchApp:{fetchAll(rs){return rs.map(({url,...o})=>this.fetch(url,o));},fetch(url,o){
  if(url.includes("telegram")){const m=url.split("/").pop();if(m==="getUpdates")return R(200,{ok:true,result:[]});
   const p=JSON.parse(o.payload);if(p.reply_markup)reminders++;else tg.push(p.text);return R(200,{ok:true,result:{message_id:1}});}
  if(url.endsWith("/cinemas"))return R(200,cinema);
  const d=url.split("/").pop();return R(200,details.get(d)||[]);}},
 MailApp:{sendEmail(x){mails.push(x);}}};
vm.createContext(env);
const base_=process.env.PATCH_BASE||"";for(const f of ["tools/google_apps_script_sentinel.gs","tools/google_apps_script_showtime_signal.gs","tools/google_apps_script_booking_monitor.gs","tools/google_apps_script_imax_patch_20261126.gs"])vm.runInContext(fs.readFileSync(f,"utf8"),env);
const d="2026-12-18";
const S=(t,hall,id,tags=["DEFAULT","pmr"])=>({time:d+" "+t,version:"vostfr-ma",tags,status:"available",
 reservabilityStart:"2026-09-08T13:52:03+00:00",reservabilityEnd:d+"T23:00:00+00:00",
 refCmd:"https://s.pathe.ma/fr/V5401S"+id+"/booking",auditoriumName:hall,auditoriumCapacity:"235",isMovie:true});
const base=[S("10:30:00","1",1),S("16:00:00","4DX",2,["4dx","DEFAULT","pmr"])];
details.set(d,base);
env.sentinelleCheckWithBookingOnce("2026-11-26T19:00:00Z");
assert.ok(mails.some(m=>/séances classiques ajoutées \(pas IMAX\)/.test(m.subject)),"calm standard");
assert.equal(props.getProperty("DOOMSDAY_CRITICAL_REMINDER_V1"),null,"no reminder for standard");
const n=mails.length;
details.set(d,base.concat([S("20:00:00","IMAX",3,["DEFAULT","imax","pmr"])]));
env.sentinelleCheckWithBookingOnce("2026-11-26T19:05:00Z");
const imaxMail=mails.slice(n).find(m=>/^🎬🚨 IMAX OUVERT/.test(m.subject));
assert.ok(imaxMail,"IMAX alert");assert.match(imaxMail.body,/V5401S3\/booking/);
assert.equal(JSON.parse(props.getProperty("DOOMSDAY_CRITICAL_REMINDER_V1")).acked,false,"reminder armed");
const n2=mails.length;env.sentinelleCheckWithBookingOnce("2026-11-26T19:06:00Z");
assert.equal(mails.slice(n2).filter(m=>/IMAX/.test(m.subject)).length,0,"no dup");
// IMAX by tag only, listed before sales
const d2="2026-12-19";
details.set(d2,[{...S("19:00:00","7",10,["IMAX-LASER"]),time:d2+" 19:00:00",reservabilityStart:"2026-11-27T10:00:00+00:00",reservabilityEnd:d2+"T19:20:00+00:00"}]);
props.setProperty("DOOMSDAY_CRITICAL_REMINDER_V1",JSON.stringify({acked:true}));
env.sentinelleCheckWithBookingOnce("2026-11-26T19:10:00Z");
const pub=mails.find(m=>/^🎬 IMAX publié/.test(m.subject));assert.ok(pub);assert.match(pub.body,/2026-11-27 11:00/);
assert.equal(JSON.parse(props.getProperty("DOOMSDAY_CRITICAL_REMINDER_V1")).acked,false);
// /cinemas imax tag
const msg=env.sentinelleEventMessage_(env.sentinelleDiff_({days:[{date:d,versions:["vf-ma"],tags:["DEFAULT"]}]},{days:[{date:d,versions:["vf-ma"],tags:["DEFAULT","imax"]}]}));
assert.match(msg.subject,/IMAX apparaît/);
const st=env.imaxPatchSelfTest();assert.equal(st.ok,true,JSON.stringify(st));
props.setProperty("DOOMSDAY_IMAX_PRIORITY","false");
assert.match(env.sentinelleDetailedAlert_(d,[{localTime:d+" 10:00:00",version:"vf",tags:[]}]).subject,/réservation ouverte/);
console.log("PATCH OK",JSON.stringify(st));
