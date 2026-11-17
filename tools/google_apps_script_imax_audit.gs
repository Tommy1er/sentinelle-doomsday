/**
 * One-shot IMAX discovery. Official public endpoints only.
 * No trigger, messages, properties, heartbeat, booking or purchase.
 * Bounds: at most 40 catalogue films, 8 detailed film/date probes.
 */
function sentinelleAuditImaxOnce() {
  var started=Date.now(), now=new Date().toISOString();
  var base="https://www.pathe.ma", cinema="cinema-pathe-californie";
  function request(path) {return {url:base+path,muteHttpExceptions:true,
    validateHttpsCertificates:true,headers:{Accept:"application/json"}};}
  function parse(response,limit) {
    if(response.getResponseCode()!==200)throw new Error("Audit HTTP "+response.getResponseCode());
    var text=response.getContentText();
    if(text.length>limit)throw new Error("Audit response too large");
    return JSON.parse(text);
  }
  var catalogue=parse(UrlFetchApp.fetch(base+"/api/shows",request("/api/shows")),2000000);
  if(!catalogue || !Array.isArray(catalogue.shows))throw new Error("Unexpected catalogue");
  var films=catalogue.shows.filter(function(f){return f && typeof f.slug==="string" &&
    /^[a-z0-9-]{5,100}$/.test(f.slug);}).slice(0,40);
  var errors=[],tags={},candidates=[],responses=UrlFetchApp.fetchAll(films.map(function(f){
    return request("/api/show/"+f.slug+"/cinemas");
  }));
  responses.forEach(function(r,i){
    try {
      var payload=parse(r,500000),focus=payload[cinema];
      if(!focus)return;
      if(!focus.days || typeof focus.days!=="object" || Array.isArray(focus.days))throw new Error("Unexpected days");
      Object.keys(focus.days).sort().forEach(function(date){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Unexpected date");
        var day=focus.days[date],list=Array.isArray(day.tags)?day.tags:[];
        list.forEach(function(tag){tags[String(tag)]=true;});
        if(list.some(function(tag){return /imax/i.test(String(tag));}))
          candidates.push({slug:films[i].slug,title:films[i].title,date:date,tags:list});
      });
    }catch(e){errors.push({stage:"cinemas",slug:films[i].slug,type:String(e.message).slice(0,80)});}
  });
  var selected=candidates.slice(0,8),sessions=[];
  if(selected.length)UrlFetchApp.fetchAll(selected.map(function(c){
    return request("/api/show/"+c.slug+"/showtimes/"+cinema+"/"+c.date);
  })).forEach(function(r,i){
    var c=selected[i];
    try {
      var raw=parse(r,300000),signals=patheShowtimeSignalsV1(raw,now);
      raw.forEach(function(s){
        var signal=signals.filter(function(x){return x.bookingUrl===s.refCmd;})[0];
        if(!(Array.isArray(s.tags)&&s.tags.some(function(t){return /imax/i.test(t);})) &&
           !/imax/i.test(String(s.auditoriumName||"")))return;
        sessions.push({slug:c.slug,title:c.title,time:s.time,version:s.version,tags:s.tags,
          auditoriumName:s.auditoriumName||null,auditoriumId:s.auditoriumId||null,
          auditoriumCapacity:s.auditoriumCapacity||null,status:s.status,
          bookingUrl:signal?signal.bookingUrl:null,apiProposed:!!(signal&&signal.bookingProposedByApi),
          imaxLaserConfirmed:false});
      });
    }catch(e){errors.push({stage:"details",slug:c.slug,date:c.date,type:String(e.message).slice(0,80)});}
  });
  var result={checkedAtUtc:now,durationMs:Date.now()-started,catalogueCount:catalogue.shows.length,
    filmsChecked:films.length,catalogueTruncated:catalogue.shows.length>films.length,
    cinema:cinema,observedProgrammeTags:Object.keys(tags).sort(),imaxFilmDates:candidates.length,
    detailDatesChecked:selected.length,detailDatesNotChecked:Math.max(0,candidates.length-selected.length),
    sessions:sessions.slice(0,24),errors:errors,notificationsSent:0,heartbeatSent:false};
  console.log(JSON.stringify(result));return result;
}
