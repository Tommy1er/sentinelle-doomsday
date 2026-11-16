/**
 * One-shot GET audit. Endpoints were observed in the normal Pathé browser
 * resource inventory on 16 Nov 2026, not guessed from another country's API.
 */
function auditPatheDetailedShowtimes() {
  var paths=[
    "/api/show/comment-braquer-une-banque-56359/showtimes/cinema-pathe-californie/2026-11-16",
    "/api/show/scrooge-ebenezer-54897/showtimes/cinema-pathe-californie/2026-11-16",
    "/api/tags"
  ];
  return paths.map(function(path){
    var response=UrlFetchApp.fetch("https://www.pathe.ma"+path,{
      muteHttpExceptions:true,validateHttpsCertificates:true,
      headers:{Accept:"application/json"}
    });
    var code=response.getResponseCode(),raw=response.getContentText(),value=null;
    try{value=JSON.parse(raw);}catch(_){}
    if(path==="/api/tags"&&Array.isArray(value)){
      value=value.filter(function(t){return /imax/i.test(JSON.stringify(t));});
    }
    var report={checkedUtc:new Date().toISOString(),path:path,httpStatus:code,
      responseLength:raw.length,jsonParsed:value!==null,
      publicDataPreview:value!==null?JSON.stringify(value).slice(0,16000):null,
      bookingVerifiedByThisProbe:false};
    console.log(JSON.stringify(report));return report;
  });
}
