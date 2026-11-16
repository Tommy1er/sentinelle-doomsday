/**
 * Run manually after creating a private Telegram bot with @BotFather,
 * adding TG_BOT_TOKEN to Apps Script Script Properties, and sending /start
 * from the intended private Telegram account to that bot.
 *
 * Requires exactly one distinct private chat. If the bot is used by more than
 * one account, configure TG_CHAT_ID manually in Script Properties instead.
 * Never logs the bot token, username, chat ID or incoming messages.
 */
function sentinelleDiscoverTelegramChat() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("TG_BOT_TOKEN");
  if (!token) throw new Error("TG_BOT_TOKEN property missing");
  var response = UrlFetchApp.fetch("https://api.telegram.org/bot" +
    encodeURIComponent(token) + "/getUpdates?limit=100&timeout=0", {
    muteHttpExceptions: true,
    followRedirects: false
  });
  if (response.getResponseCode() !== 200) throw new Error("Telegram getUpdates rejected");
  var data = JSON.parse(response.getContentText());
  if (!data || data.ok !== true || !Array.isArray(data.result)) {
    throw new Error("Invalid Telegram response");
  }
  var ids = {};
  data.result.forEach(function(update) {
    var chat = update.message && update.message.chat;
    if (chat && chat.type === "private" && (typeof chat.id === "number" || typeof chat.id === "string")) {
      ids[String(chat.id)] = true;
    }
  });
  var candidates = Object.keys(ids);
  if (candidates.length !== 1) {
    throw new Error("Expected exactly one private chat; found " + candidates.length +
      ". Send /start to the bot or set TG_CHAT_ID manually.");
  }
  props.setProperty("TG_CHAT_ID", candidates[0]);
  console.log("Telegram private chat configured successfully (ID not printed)");
  return { configured: true, chatIdHidden: true };
}
