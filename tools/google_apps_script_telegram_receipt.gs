/**
 * Explicitly labelled Telegram TEST to the already configured private recipient.
 * Bot token, chat ID and callbacks remain private Script Properties.
 * No trigger, Gmail message, ticket purchase or runtime scheduling.
 */
function sentinelleReceiptTelegramCall_(method,payload) {
  var p=PropertiesService.getScriptProperties(), token=p.getProperty("TG_BOT_TOKEN");
  if(!token)throw new Error("Telegram private configuration missing");
  try {
    var r=UrlFetchApp.fetch("https://api.telegram.org/bot"+encodeURIComponent(token)+"/"+method,{
      method:"post",contentType:"application/json",payload:JSON.stringify(payload),
      muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true});
    var data=JSON.parse(r.getContentText());
    if(r.getResponseCode()!==200||!data||data.ok!==true)throw new Error("Rejected");
    return data.result;
  }catch(_){throw new Error("Telegram receipt operation failed; credentials hidden");}
}
function sentinelleSendTelegramReceiptTest() {
  var p=PropertiesService.getScriptProperties(),chat=p.getProperty("TG_CHAT_ID");
  if(!chat)throw new Error("Telegram private recipient missing");
  var nonce=Utilities.getUuid(),at=new Date().toISOString(),callback="receipt:"+nonce;
  var result=sentinelleReceiptTelegramCall_("sendMessage",{chat_id:chat,
    text:"🧪 TEST Sentinelle Doomsday — "+at+
      "\nAucune ouverture de billetterie annoncée.\nDepuis ton téléphone, appuie sur le bouton pour confirmer que tu reçois les alertes.",
    reply_markup:{inline_keyboard:[[{text:"TEST reçu sur mon téléphone",callback_data:callback}]]}});
  if(!result||!Number.isInteger(result.message_id))throw new Error("Telegram message identifier missing");
  p.setProperty("DOOMSDAY_RECEIPT_TEST_V1",JSON.stringify({
    nonce:nonce,at:at,messageId:result.message_id,acknowledged:false}));
  console.log(JSON.stringify({test:"TELEGRAM_RECEIPT",acceptedByApi:true,sentAtUtc:at,
    phoneReceiptConfirmed:false}));
}
function sentinelleTelegramReceiptStatus() {
  var p=PropertiesService.getScriptProperties(),chat=p.getProperty("TG_CHAT_ID"),
    raw=p.getProperty("DOOMSDAY_RECEIPT_TEST_V1");
  if(!chat||!raw)throw new Error("Receipt test missing");
  var state=JSON.parse(raw);
  if(!state.acknowledged) {
    // No offset: do not acknowledge/discard another consumer's update queue.
    var updates=sentinelleReceiptTelegramCall_("getUpdates",{limit:100,timeout:0});
    if(!Array.isArray(updates))throw new Error("Telegram update schema invalid");
    updates.some(function(u){
      var q=u&&u.callback_query,m=q&&q.message;
      if(!q||q.data!=="receipt:"+state.nonce||!m||!m.chat||m.chat.type!=="private"||
        String(m.chat.id)!==String(chat)||m.message_id!==state.messageId||
        !q.from||String(q.from.id)!==String(chat))return false;
      // The button itself proves the declaration. Telegram may reject answering
      // an older callback; do not lose that proof because its popup has expired.
      state.acknowledged=true;state.acknowledgedAtUtc=new Date().toISOString();
      p.setProperty("DOOMSDAY_RECEIPT_TEST_V1",JSON.stringify(state));
      try {sentinelleReceiptTelegramCall_("answerCallbackQuery",{callback_query_id:q.id,
        text:"Réception du TEST confirmée. Merci !"});}catch(_) {}
      return true;
    });
  }
  var summary={test:"TELEGRAM_RECEIPT",sentAtUtc:state.at,
    recipientAcknowledgedPhoneReceipt:state.acknowledged===true,
    acknowledgedAtUtc:state.acknowledgedAtUtc||null,
    notice:"Recipient button acknowledgement is a declaration, not device telemetry."};
  console.log(JSON.stringify(summary));return summary;
}
