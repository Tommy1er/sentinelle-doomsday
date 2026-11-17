const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const state=new Map([["TG_BOT_TOKEN","PRIVATE_TOKEN"],["TG_CHAT_ID","42"]]),calls=[],logs=[];
let updates=[],fail=false,expireAnswer=false;
const c=vm.createContext({Date,console:{log:x=>logs.push(x)},
Utilities:{getUuid:()=>"nonce"},PropertiesService:{getScriptProperties:()=>({
getProperty:k=>state.get(k)??null,setProperty:(k,v)=>state.set(k,v)})},
UrlFetchApp:{fetch:(url,opt)=>{if(fail)throw Error(url);const method=url.split("/").pop(),data=JSON.parse(opt.payload);
calls.push({method,data});if(expireAnswer&&method==="answerCallbackQuery")throw Error("query too old");return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,
result:method==="sendMessage"?{message_id:123}:method==="getUpdates"?updates:true})};}}});
vm.runInContext(fs.readFileSync("tools/google_apps_script_telegram_receipt.gs","utf8"),c);
c.sentinelleSendTelegramReceiptTest();
assert.match(calls[0].data.text,/TEST/);
const q={id:"callback",data:"receipt:nonce",from:{id:42},
message:{message_id:123,chat:{type:"private",id:42}}};
for(const bad of [{...q,data:"receipt:old"},{...q,from:{id:99}},
{...q,message:{...q.message,message_id:122}},
{...q,message:{...q.message,chat:{type:"group",id:42}}}]){
updates=[{callback_query:bad}];assert.equal(c.sentinelleTelegramReceiptStatus().recipientAcknowledgedPhoneReceipt,false);
}
updates=[{callback_query:q}];expireAnswer=true;
assert.equal(c.sentinelleTelegramReceiptStatus().recipientAcknowledgedPhoneReceipt,true);
assert.equal(calls.filter(x=>x.method==="answerCallbackQuery").length,1);
let prior=calls.length;c.sentinelleTelegramReceiptStatus();assert.equal(calls.length,prior);
assert.equal(calls.some(x=>x.method==="getUpdates"&&"offset" in x.data),false);
fail=true;assert.throws(()=>c.sentinelleReceiptTelegramCall_("getUpdates",{}),e=>!e.message.includes("PRIVATE_TOKEN"));
assert.equal(logs.join("").includes("PRIVATE_TOKEN"),false);
console.log("PASS TEST label, nonce/sender/chat/message binding, persistent acknowledgement, no update offset, sanitized transport errors");
