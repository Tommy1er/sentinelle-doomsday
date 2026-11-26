// PATCH IMAX v2 - partie 2/3 (charge apres ImaxPatch.gs).
// Remplace la version de Code.gs : un tag imax ajoute plus tard a une seance deja connue est aussi vu.
function sentinelleDetailedSmallSnapshot_(signals) {
var result = signals.map(function (s) {
return { id: s.id, open: s.bookingProposedByApi === true, imax: sentinelleIsImax_(s),
st: s.salesState === "UNCERTAIN" ? "U" : s.salesState === "NOT_YET" ? "N" : s.salesState === "ENDED" ? "E" : "O" };
});
if (JSON.stringify(result).length > 8500) throw new Error("Detailed snapshot storage budget exhausted");
return result;
}

// Remplace la version de Code.gs : une vente "peut-etre ouverte" en IMAX porte le mot IMAX dans le titre.
function sentinelleUncertainAlert_(date, uncertain) {
var hasImax = uncertain.some(sentinelleIsImax_);
var lines = [
(hasImax ? "🎬⚠️ IMAX — " : "⚠️ ") + "AVENGERS: DOOMSDAY — SÉANCES PUBLIÉES, VENTE PEUT-ÊTRE OUVERTE",
"Cinéma : Pathé Californie — Casablanca",
"Date : " + date,
"La fenêtre de vente n'est pas fermée, mais la sentinelle ne reconnaît pas le lien ou le statut de Pathé.",
"VÉRIFIE MAINTENANT sur le site ou l'appli Pathé.",
"Séances :"
];
uncertain.slice(0, 10).forEach(function (s) {
lines.push(sentinelleSessionLine_(s) + " — statut Pathé : " + String(s.status).slice(0, 30));
if (s.bookingUrl) lines.push("  Lien : " + s.bookingUrl);
});
if (uncertain.length > 10) lines.push("… et " + (uncertain.length - 10) + " autres séances.");
if (uncertain.some(function (s) { return s.linkUntrusted; })) {
lines.push("Note : un lien hors domaine Pathé a été ignoré par sécurité. Passe par pathe.ma ou l'appli officielle.");
}
lines.push("Fiche officielle : " + DOOMSDAY_SENTINEL.publicPage);
return { subject: (hasImax ? "🎬⚠️ IMAX — vente peut-être ouverte : vérifie MAINTENANT " : "⚠️ DOOMSDAY — séances publiées, vente peut-être ouverte : vérifie MAINTENANT ") + date,
body: lines.join("\n") };
}

function sentinelleHtmlEscape_(t) {
return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Remplace la version de Code.gs : les e-mails urgents sont mis en forme (gros titre rouge, liens cliquables).
function sentinelleSendMail_(props, subject, text) {
var address = props.getProperty(DOOMSDAY_SENTINEL.secretEmail);
if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
throw new Error("ALERT_EMAIL_TO script property not configured");
}
var msg = { to: address, subject: subject, body: text, name: "Sentinelle Doomsday" };
if (/^(🎬|🔁|⚠️|🚨)/.test(String(subject))) {
var lines = String(text).split("\n");
var body = lines.map(function (l) {
return sentinelleHtmlEscape_(l).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
}).join("<br>");
msg.htmlBody = '<div style="font-family:Arial,sans-serif">' +
'<div style="background:#b00020;color:#fff;font-size:22px;font-weight:bold;padding:14px;border-radius:6px">' +
sentinelleHtmlEscape_(subject) + '</div><div style="font-size:16px;line-height:1.5;padding:12px 4px">' +
body + '</div></div>';
}
MailApp.sendEmail(msg);
}


// Remplace la version de Code.gs : rappels Telegram a chaque cycle ET rappels e-mail
// (a +5, +10, +15, +30, +45, +60 min) tant que "J'ai vu" n'est pas appuye dans Telegram.
function sentinelleCriticalReminderTick_(props, nowIso) {
var rec = sentinelleReadJsonProperty_(props, DOOMSDAY_BOOKING_V1.criticalKey, null);
if (!rec || rec.acked) return "NONE";
if (rec.sent >= DOOMSDAY_BOOKING_V1.maxReminders) return "EXHAUSTED";
var now = Date.parse(nowIso), armed = Date.parse(rec.armedAt);
if (!isFinite(now) || !isFinite(armed)) return "INVALID";
if (now - armed < DOOMSDAY_BOOKING_V1.reminderMinGapMs * (rec.sent + 1)) return "WAITING";
var chat = String(props.getProperty(DOOMSDAY_SENTINEL.secretChat) || "");
if (chat) {
try {
var updates = sentinelleTelegramApi_(props, "getUpdates", { limit: 100, timeout: 0 });
(Array.isArray(updates) ? updates : []).some(function (u) {
var q = u && u.callback_query, m = u && u.message;
var tapped = q && q.data === "seen:" + rec.nonce && q.from && String(q.from.id) === chat;
var replied = m && m.chat && String(m.chat.id) === chat && typeof m.text === "string" &&
Number(m.date) * 1000 >= armed;
if (!tapped && !replied) return false;
rec.acked = true; rec.ackedAt = nowIso;
if (tapped) {
try { sentinelleTelegramApi_(props, "answerCallbackQuery", { callback_query_id: q.id, text: "OK, rappels arrêtés." }); } catch (_) {}
}
return true;
});
} catch (_) {}
}
if (!rec.acked) {
var n = rec.sent + 1, total = DOOMSDAY_BOOKING_V1.maxReminders, delivered = false;
var head = String(rec.summary).split("\n")[0];
if (chat) {
try {
sentinelleTelegramApi_(props, "sendMessage", {
chat_id: chat, disable_web_page_preview: true,
text: "🔁 RAPPEL " + n + "/" + total + "\n" + rec.summary +
"\n\nAppuie sur « J'ai vu » (ou réponds n'importe quoi) pour arrêter les rappels.",
reply_markup: { inline_keyboard: [[{ text: "✅ J'ai vu", callback_data: "seen:" + rec.nonce }]] }
});
delivered = true;
} catch (_) {}
}
if (DOOMSDAY_IMAX_PATCH.mailReminderSteps.indexOf(n) !== -1) {
try {
if (MailApp.getRemainingDailyQuota() > DOOMSDAY_IMAX_PATCH.mailQuotaReserve) {
sentinelleSendMail_(props, "🔁 RAPPEL " + n + "/" + total + " — " + head.slice(0, 120),
rec.summary + "\n\nRappel automatique. Pour arrêter : appuie sur « J'ai vu » dans Telegram " +
"(ou réponds n'importe quoi au bot). Sinon les rappels s'arrêtent seuls après une heure.");
delivered = true;
}
} catch (_) {}
}
if (delivered) rec.sent++;
}
props.setProperty(DOOMSDAY_BOOKING_V1.criticalKey, JSON.stringify(rec));
return rec.acked ? "ACKNOWLEDGED" : "REMINDED";
}

