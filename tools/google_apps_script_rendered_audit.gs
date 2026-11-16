/**
 * Manual public-HTML comparison; never schedules, notifies or books.
 * A booking button is a structural clue, not proof of available inventory.
 */
function auditPatheRenderedScreenings() {
  const urls = [
    "https://www.pathe.ma/fr/films/avengers-doomsday-55389",
    "https://www.pathe.ma/fr/films/comment-braquer-une-banque-56359"
  ];
  const reports = urls.map(function(url) {
    const res = UrlFetchApp.fetch(url, {muteHttpExceptions:true, followRedirects:true,
      validateHttpsCertificates:true, headers:{Accept:"text/html,application/xhtml+xml"}});
    const html = res.getContentText();
    const buttons = [];
    const rx = /<button\b[^>]*data-btn-type=["']book-screening["'][^>]*>[\s\S]*?<\/button>/gi;
    let m;
    while ((m=rx.exec(html)) !== null) {
      const text=m[0].replace(/<svg\b[\s\S]*?<\/svg>/gi," ")
        .replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
      buttons.push({text:text.slice(0,180), disabled:/\bdisabled\b/i.test(m[0].split(">")[0])});
    }
    const extra = {};
    ["sessions","screenings","startAt","startsAt","dateTime","cinemaId","sessionId","id","booking"].forEach(function(key) {
      extra[key]=patheFindValues_(html,key,3);
    });
    const scripts=[];
    const sr=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    while((m=sr.exec(html))!==null) {
      if(/application\/(?:ld\+)?json/i.test(m[1])) {
        let info={attributes:m[1].slice(0,180),length:m[2].length};
        try {const v=JSON.parse(m[2]);info.root_keys=Object.keys(v).slice(0,20);}catch(_){info.parsed=false;}
        scripts.push(info);
      }
    }
    return {checked_at_utc:new Date().toISOString(),url:url,http_status:res.getResponseCode(),
      html_length:html.length,booking_button_count:buttons.length,
      booking_button_samples:buttons.slice(0,6),json_scripts:scripts,extra_fields:extra,
      booking_confirmed:null};
  });
  reports.forEach(function(r){console.log(JSON.stringify(r));});
  return reports;
}
