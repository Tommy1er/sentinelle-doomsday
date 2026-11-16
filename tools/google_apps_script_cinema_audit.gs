/** Manual GET-only probe of endpoints observed in Pathé's public transfer cache. */
function auditPatheCinemaProgramming() {
  const urls=[
    "https://www.pathe.ma/api/show/avengers-doomsday-55389/cinemas",
    "https://www.pathe.ma/api/show/comment-braquer-une-banque-56359/cinemas"
  ];
  return urls.map(function(url){
    const res=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true,
      validateHttpsCertificates:true,headers:{Accept:"application/json"}});
    const raw=res.getContentText();
    let value;try{value=JSON.parse(raw);}catch(_){value=null;}
    const r={checked_at_utc:new Date().toISOString(),url:url,http_status:res.getResponseCode(),
      response_length:raw.length,json_parsed:value!==null,
      cinema_keys:value&&typeof value==="object"?Object.keys(value):[],
      public_programming_preview:value!==null?JSON.stringify(value).slice(0,6500):null,
      booking_confirmed:null};
    console.log(JSON.stringify(r));return r;
  });
}
