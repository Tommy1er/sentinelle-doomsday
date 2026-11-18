/** Manual discovery only: no automatic target replacement and no messages. */
function sentinelleAuditDoomsdayCatalogue() {
  var response=UrlFetchApp.fetch("https://www.pathe.ma/api/shows",{
    muteHttpExceptions:true,validateHttpsCertificates:true,headers:{Accept:"application/json"}
  });
  if(response.getResponseCode()!==200)throw new Error("Catalogue HTTP failure");
  var text=response.getContentText();
  if(text.length>2000000)throw new Error("Catalogue size unexpected");
  var data=JSON.parse(text);
  if(!data || !Array.isArray(data.shows))throw new Error("Catalogue schema unknown");
  var candidates=data.shows.filter(function(film){
    return film && /doomsday/i.test(String(film.slug||"")+" "+String(film.title||""));
  }).map(function(film){
    if(typeof film.slug!=="string" || !/^[a-z0-9-]+$/.test(film.slug))throw new Error("Catalogue slug invalid");
    return {slug:film.slug,title:film.title,releaseAt:film.releaseAt};
  });
  var result={checkedAtUtc:new Date().toISOString(),catalogueCount:data.shows.length,
    candidates:candidates,targetSeen:candidates.some(function(x){return x.slug==="avengers-doomsday-55389";}),
    automaticTargetChange:false};
  console.log(JSON.stringify(result));return result;
}
