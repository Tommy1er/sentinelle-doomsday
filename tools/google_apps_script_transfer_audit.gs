/**
 * Inspect Angular's public server-rendered transfer-cache schema.
 * No account state, notifications, triggers or booking actions.
 */
function auditPatheTransferCache() {
  const urls=[
    "https://www.pathe.ma/fr/films/avengers-doomsday-55389",
    "https://www.pathe.ma/fr/films/comment-braquer-une-banque-56359"
  ];
  return urls.map(function(url){
    const res=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true,
      validateHttpsCertificates:true,headers:{Accept:"text/html,application/xhtml+xml"}});
    const html=res.getContentText();
    const match=html.match(/<script\b[^>]*id=["']ng-state["'][^>]*>([\s\S]*?)<\/script>/i);
    const state=match?JSON.parse(match[1]):{};
    const entries=[];
    Object.keys(state).filter(function(k){return /^\d+$/.test(k);}).forEach(function(k){
      const value=state[k];
      const out={cache_key:k,keys:Object.keys(value||{})};
      if(value && typeof value==="object"){
        ["u","url","s","status"].forEach(function(p){if(value[p]!==undefined)out[p]=value[p];});
        ["b","body"].forEach(function(p){
          if(value[p]!==undefined)out[p]=patheSafeSummary_(value[p],0);
        });
      }
      entries.push(out);
    });
    const report={checked_at_utc:new Date().toISOString(),url:url,http_status:res.getResponseCode(),ng_state_found:!!match,entries:entries};
    console.log(JSON.stringify(report));return report;
  });
}
