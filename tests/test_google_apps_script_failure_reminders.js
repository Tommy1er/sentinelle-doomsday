"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
function scope(kind, persisted=new Map()) {
  const sent=[];
  const props={getProperty:k=>persisted.get(k)??null,setProperty:(k,v)=>persisted.set(k,String(v))};
  persisted.set("TG_BOT_TOKEN","TEST_ONLY");persisted.set("TG_CHAT_ID","1");persisted.set("ALERT_EMAIL_TO","test@example.invalid");
  const response=(code,body)=>({getResponseCode:()=>code,getContentText:()=>JSON.stringify(body)});
  const c=vm.createContext({console:{log(){}},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    PropertiesService:{getScriptProperties:()=>props},
    UrlFetchApp:{fetch:(url,opt)=>{
      if(url.startsWith("https://api.telegram.org/"))return response(200,{ok:true});
      if(url.endsWith("/cinemas"))return kind==="core"?response(503,{}):response(200,{});
      if(url.includes("/showtimes/"))return response(503,{});
      throw Error("Unexpected request");
    }},MailApp:{sendEmail:msg=>sent.push(msg)}});
  for(const p of ["google_apps_script_sentinel.gs","google_apps_script_showtime_signal.gs","google_apps_script_booking_monitor.gs"])
    vm.runInContext(fs.readFileSync("tools/"+p,"utf8"),c);
  return {c,sent,persisted};
}
for(const kind of ["core","detail"]) {
  const s=scope(kind);
  for(let n=1;n<=36;n++){
    if(kind==="core")assert.throws(()=>s.c.sentinelleCheckOnce());
    else s.c.sentinelleCheckWithBookingOnce("2026-11-17T10:00:00Z");
    const expected=[3,12,24,36].filter(x=>x<=n).length;
    assert.equal(s.sent.length,expected,kind+" at failure "+n);
  }
  const restarted=scope(kind,s.persisted);
  for(let n=37;n<=48;n++){
    if(kind==="core")assert.throws(()=>restarted.c.sentinelleCheckOnce());
    else restarted.c.sentinelleCheckWithBookingOnce("2026-11-17T10:00:00Z");
  }
  assert.equal(restarted.sent.length,1,"one persisted reminder at failure 48");
  console.log("PASS "+kind+": recurring failure alerts at 3,12,24,36,48 across restart");
}
