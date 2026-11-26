"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const state=new Map();let mails=[],tgMsgs=[],tgRem=[],updates=[];
const props={getProperty:k=>state.get(k)??null,setProperty:(k,v)=>state.set(k,String(v)),getKeys:()=>[...state.keys()]};
state.set("TG_BOT_TOKEN","T");state.set("TG_CHAT_ID","1");state.set("ALERT_EMAIL_TO","a@b.c");
state.set("DOOMSDAY_PRODUCTION_ENABLED","true");
const details=new Map();let cinema={};
const R=(c,p)=>({getResponseCode:()=>c,getContentText:()=>JSON.stringify(p)});
const env={console:{log(){}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 PropertiesService:{getScriptProperties:()=>props},
 ScriptApp:{getProjectTriggers:()=>[{getHandlerFunction:()=>"sentinelleProductionTick"}]},
 UrlFetchApp:{fetchAll(rs){return rs.map(({url,...o})=>this.fetch(url,o));},fetch(url,o){
  if(url.includes("telegram")){const m=url.split("/").pop();
   if(m==="getUpdates")return R(200,{ok:true,result:updates});
   if(m==="getMe")return R(200,{ok:true,result:{id:9}});
   if(m==="answerCallbackQuery")return R(200,{ok:true,result:true});
   const p=JSON.parse(o.payload);(p.reply_markup?tgRem:tgMsgs).push(p.text);return R(200,{ok:true,result:{message_id:1}});}
  if(url.endsWith("/cinemas"))return R(200,cinema);
  const d=url.split("/").pop();return R(200,details.get(d)||[]);}},
 MailApp:{sendEmail(x){mails.push(x);},getRemainingDailyQuota:()=>80}};
vm.createContext(env);
for(const f of ["pr6_sentinel.gs","pr6_showtime_signal.gs","pr6_booking_monitor.gs","p1.gs","p2.gs","p3.gs","p4.gs"])vm.runInContext(fs.readFileSync(f,"utf8"),env);
const d="2026-12-18";
cinema={"cinema-pathe-californie":{days:{[d]:{versions:["vostfr-ma"],tags:["DEFAULT","pmr"]}}}};
const S=(t,hall,id,tags=["DEFAULT","pmr"],extra={})=>({time:d+" "+t,version:"vostfr-ma",tags,status:"available",
 reservabilityStart:"2026-09-08T13:52:03+00:00",reservabilityEnd:d+"T23:00:00+00:00",
 refCmd:"https://s.pathe.ma/fr/V5401S"+id+"/booking",auditoriumName:hall,auditoriumCapacity:"235",isMovie:true,...extra});
const base=[S("10:30:00","1",1)];
details.set(d,base);
const T=m=>new Date(Date.parse("2026-11-26T19:00:00Z")+m*60000).toISOString();
env.sentinelleCheckWithBookingOnce(T(0));
assert.ok(mails.some(m=>/pas IMAX/.test(m.subject)));assert.equal(mails.find(m=>/pas IMAX/.test(m.subject)).htmlBody,undefined,"calm mail stays plain");
// IMAX appears (retag-proof) 
details.set(d,base.concat([S("20:00:00","7",3,["DEFAULT","imax_laser"])]));
const n0=mails.length;
env.sentinelleCheckWithBookingOnce(T(5));
const im=mails.slice(n0).find(m=>/^🎬🚨 IMAX OUVERT/.test(m.subject));assert.ok(im);assert.match(im.htmlBody,/#b00020/);assert.match(im.htmlBody,/<a href="https:\/\/s\.pathe\.ma\/fr\/V5401S3\/booking">/);
// reminders: cycles every 5 min for 65 min
for(let k=2;k<=15;k++)env.sentinelleCheckWithBookingOnce(T(5*k));
const remMails=mails.filter(m=>/^🔁 RAPPEL/.test(m.subject)).map(m=>m.subject.match(/RAPPEL (\d+)/)[1]);
assert.deepEqual(remMails,["1","2","3","6","9","12"],"mail reminder steps "+remMails);
assert.equal(tgRem.length,12);
assert.match(mails.find(m=>/^🔁 RAPPEL 1\//.test(m.subject)).subject,/IMAX OUVERT/);
// ack via Telegram stops both
const st=JSON.parse(state.get("DOOMSDAY_CRITICAL_REMINDER_V1"));assert.equal(st.sent,12);
// new IMAX uncertain, ack after 1 reminder
details.set(d,base.concat([S("20:00:00","7",3,["DEFAULT","imax_laser"]),S("22:30:00","IMAX",4,["imax"],{status:"weird"})]));
env.sentinelleCheckWithBookingOnce(T(100));
assert.ok(mails.some(m=>/^🎬⚠️ IMAX — vente peut-être ouverte/.test(m.subject)));
env.sentinelleCheckWithBookingOnce(T(105));
const nonce=JSON.parse(state.get("DOOMSDAY_CRITICAL_REMINDER_V1")).nonce;
updates.push({update_id:5,callback_query:{id:"c",data:"seen:"+nonce,from:{id:1}}});
const before=mails.length;
assert.equal(env.sentinelleCheckWithBookingOnce(T(110)).criticalReminder,"ACKNOWLEDGED");
assert.equal(mails.length,before,"no mail after ack");
// quota guard
env.MailApp.getRemainingDailyQuota=()=>3;
// sanity check
state.set("DOOMSDAY_LAST_AUTOMATIC_RUN_V1",JSON.stringify({atUtc:new Date().toISOString(),watchdog:"ACKNOWLEDGED"}));
state.set("DOOMSDAY_MONITOR_LAST_OK_V1",new Date().toISOString());state.set("DOOMSDAY_DETAIL_LAST_OK_V1",new Date().toISOString());
env.MailApp.getRemainingDailyQuota=()=>80;
const sc=env.sentinelleSanityCheck();
console.log(JSON.stringify(sc.issues),JSON.stringify(sc.warnings));
assert.equal(sc.issues.length,0);assert.equal(sc.ok,true);
assert.match(sc.sessionsByDate[d],/3 séances, 2 en vente, 2 IMAX/);
assert.equal(env.imaxPatchSelfTest().ok,true);
console.log("PATCH v2 OK");
