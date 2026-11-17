/**
 * Sentinelle Doomsday — one-shot comparison of real Pathé film states.
 *
 * NO recurring trigger, NO Telegram/Gmail, NO purchase, NO cookies.
 * Fetches only official pathe.ma pages and the previously validated /cinemas API.
 * Does NOT assert that a programmed date proves tickets are purchasable.
 */
var PATHE_AUDIT_COHORT = [
  {slug:"avengers-doomsday-55389", role:"target_no_sessions_on_2026-11-16"},
  {slug:"comment-braquer-une-banque-56359", role:"programmed_control_verified_2026-11-16"},
  {slug:"aya-et-hadi-56377", role:"candidate_status_not_verified"},
  {slug:"scrooge-ebenezer-54897", role:"candidate_status_not_verified"}
];

function patheAuditCinema_(payload) {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return {valid:false, error:"non_object_root"};
  }
  var keys = Object.keys(payload);
  if (keys.some(function(k) {return !/^cinema-[a-z0-9-]+$/.test(k);})) {
    return {valid:false, error:"unexpected_root_keys"};
  }
  var focus = payload["cinema-pathe-californie"];
  if (focus === undefined) return {valid:true, cinemaDays:0, dates:[], versions:[], tags:[], dayFieldNames:[], cinemaCount:keys.length, scopedFlags:[]};
  if (!focus || typeof focus !== "object" || Array.isArray(focus) ||
      !focus.days || typeof focus.days !== "object" || Array.isArray(focus.days)) {
    return {valid:false,error:"invalid_californie_days"};
  }
  var days=focus.days, dates=Object.keys(days).sort();
  var versions={},tags={},dayFields={},flags=[];
  dates.forEach(function(d) {
    var info=days[d];
    if (!info || typeof info!=="object" || Array.isArray(info)) throw new Error("Invalid day entry");
    Object.keys(info).forEach(function(k) {dayFields[k]=true;});
    (Array.isArray(info.versions)?info.versions:[]).forEach(function(v) {if(typeof v==="string")versions[v]=true;});
    (Array.isArray(info.tags)?info.tags:[]).forEach(function(t) {if(typeof t==="string")tags[t]=true;});
    ["bookable","isBookable","salesOpen"].forEach(function(k) {
      if (typeof info[k]==="boolean") flags.push({date:d,field:k,value:info[k]});
    });
  });
  return {valid:true,cinemaDays:dates.length,dates:dates.slice(0,12),
    versions:Object.keys(versions).sort(),tags:Object.keys(tags).sort(),
    dayFieldNames:Object.keys(dayFields).sort(),cinemaCount:keys.length,
    scopedFlags:flags.slice(0,12)};
}

function patheAuditHtmlEndpoints_(html) {
  var m=/<script\b[^>]*\bid\s*=\s*["']ng-state["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return {ngStatePresent:false,ngStateParseable:false,apiPaths:[]};
  var state;
  try {state=JSON.parse(m[1]);} catch(_) {
    return {ngStatePresent:true,ngStateParseable:false,apiPaths:[]};
  }
  var paths={},nodes=[state],visited=0,hasShowtimeBody=false;
  while (nodes.length && visited<30000) {
    var entry=nodes.pop();visited++;
    if (!entry || typeof entry!=="object") continue;
    if (typeof entry.u==="string") {
      // Explicitly ignore any query string, fragments and non-Pathé hosts.
      var mm=/^(?:https:\/\/www\.pathe\.ma)?(\/api\/[a-zA-Z0-9_\/.-]{1,170})(?:[?#]|$)/.exec(entry.u);
      if (mm) paths[mm[1]]=true;
      if (mm && /\/showtimes(?:\/|$)|\/sessions(?:\/|$)/i.test(mm[1]) &&
          entry.b!==undefined) hasShowtimeBody=true;
    }
    if (Array.isArray(entry)) {
      for(var i=0;i<entry.length;i++) nodes.push(entry[i]);
    } else {
      Object.keys(entry).forEach(function(k) {nodes.push(entry[k]);});
    }
  }
  return {ngStatePresent:true,ngStateParseable:true,
    apiPaths:Object.keys(paths).sort().slice(0,40),
    showtimeBodyCached:hasShowtimeBody,
    scanTruncated:nodes.length>0};
}

function patheAuditOne_(film) {
  if (!/^[a-z0-9-]{5,100}$/.test(film.slug)) throw new Error("Invalid film slug");
  var base="https://www.pathe.ma";
  var endpoint=base+"/api/show/"+film.slug+"/cinemas";
  var page=base+"/fr/films/"+film.slug;
  var output={slug:film.slug, role:film.role, pageUrl:page,
    programmingApiPath:"/api/show/"+film.slug+"/cinemas",
    checkedUtc:new Date().toISOString(), apiStatus:null, htmlStatus:null,
    cinema:null, html:null, errors:[],
    bookabilityConfirmed:false};
  try {
    var r=UrlFetchApp.fetch(endpoint,{muteHttpExceptions:true,headers:{Accept:"application/json"}});
    output.apiStatus=r.getResponseCode();
    if (output.apiStatus===200) {
      var parsed=JSON.parse(r.getContentText());
      output.cinema=patheAuditCinema_(parsed);
    } else output.errors.push("cinemas_http_"+output.apiStatus);
  } catch(err) {output.errors.push("cinemas_"+String(err.name||"Error"));}
  try {
    var htmlResponse=UrlFetchApp.fetch(page,{muteHttpExceptions:true,headers:{Accept:"text/html"}});
    output.htmlStatus=htmlResponse.getResponseCode();
    if (output.htmlStatus===200) {
      var html=htmlResponse.getContentText();
      output.html=patheAuditHtmlEndpoints_(html);
    } else output.errors.push("film_http_"+output.htmlStatus);
  } catch(err) {output.errors.push("film_"+String(err.name||"Error"));}
  return output;
}

/** Execute MANUALLY. Four films × two public requests, one run. */
function auditPatheFilmCohort() {
  var reports=[];
  PATHE_AUDIT_COHORT.forEach(function(film,index){
    if (index>0 && typeof Utilities!=="undefined") Utilities.sleep(800);
    reports.push(patheAuditOne_(film));
  });
  var summary={checkedUtc:new Date().toISOString(),
    notice:"Cinema dates and page API paths are NOT proof of tickets on sale.",
    reports:reports};
  console.log(JSON.stringify(summary));
  return summary;
}

function testPatheCohortAuditFixture() {
  function ok(condition,message){if(!condition)throw new Error(message);}
  var empty=patheAuditCinema_({});
  ok(empty.valid&&empty.cinemaDays===0,"empty baseline");
  var other=patheAuditCinema_({"cinema-pathe-dar-essalam":{days:{
    "2026-11-16":{versions:["vf-ma"],tags:["VIP"]}}}});
  ok(other.cinemaDays===0,"other cinema excluded");
  var programmed=patheAuditCinema_({"cinema-pathe-californie":{days:{
    "2026-11-16":{versions:["vf-ma","vostfr-ma"],tags:["DEFAULT","pmr"],upsell:null},
    "2026-11-17":{versions:["vf-ma"],tags:["DEFAULT"]}}}});
  ok(programmed.valid&&programmed.cinemaDays===2,"programmed dates");
  ok(programmed.versions.length===2,"version distinctions");
  ok(programmed.scopedFlags.length===0,"no fake sale flags");
  ok(patheAuditCinema_({error:"maintenance"}).valid===false,"fail closed");
  var html='<script id="ng-state">'+JSON.stringify({
    a:{u:"https://www.pathe.ma/api/show/film-123/cinemas?token=SECRET",b:{}},
    b:{u:"https://evil.test/api/steal",b:{}},
    c:{u:"/api/show/film-123/showtimes/cinema-pathe-californie",b:{showtimes:[]}}
  })+'</script>';
  var urls=patheAuditHtmlEndpoints_(html);
  ok(urls.ngStateParseable&&urls.apiPaths.length===2,"only same-site API paths");
  ok(urls.apiPaths.every(function(p){return p.indexOf("SECRET")<0;}),"no query leakage");
  ok(urls.showtimeBodyCached,"cache showtime hint");
  ok(patheAuditHtmlEndpoints_("<html></html>").ngStatePresent===false,"no ng-state");
  console.log("PASS 9 Pathé cohort auditing fixtures");
  return true;
}
