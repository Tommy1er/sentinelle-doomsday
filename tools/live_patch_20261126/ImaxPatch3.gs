// PATCH IMAX v2 - verification complete (lecture seule).
// VERIFICATION COMPLETE, en lecture seule : n'envoie aucun message et ne modifie aucun etat.
function sentinelleSanityCheck() {
var p = PropertiesService.getScriptProperties(), issues = [], warn = [], r = { patch: DOOMSDAY_IMAX_PATCH.version };
var get = function (k) { return p.getProperty(k); };
var J = function (k) { try { return JSON.parse(get(k) || "null"); } catch (_) { issues.push("CORRUPT_" + k); return null; } };
var ageMin = function (iso) { var t = Date.parse(iso || ""); return isFinite(t) ? Math.round((Date.now() - t) / 6000) / 10 : null; };
// 1. Configuration
r.productionEnabled = get("DOOMSDAY_PRODUCTION_ENABLED") === "true";
if (!r.productionEnabled) issues.push("PRODUCTION_DISABLED");
r.productionUntil = get("DOOMSDAY_PRODUCTION_UNTIL") || null;
if (r.productionUntil && Date.parse(r.productionUntil) < Date.parse("2026-12-23T00:00:00Z")) issues.push("STOPS_BEFORE_23_DEC");
r.imaxPriority = sentinelleImaxPriorityOn_();
if (!r.imaxPriority) issues.push("IMAX_PRIORITY_OFF");
r.emailConfigured = !!get(DOOMSDAY_SENTINEL.secretEmail);
r.telegramConfigured = !!get(DOOMSDAY_SENTINEL.secretBot) && !!get(DOOMSDAY_SENTINEL.secretChat);
if (!r.emailConfigured) issues.push("EMAIL_NOT_CONFIGURED");
if (!r.telegramConfigured) warn.push("TELEGRAM_NOT_CONFIGURED");
r.healthchecksConfigured = !!get("HC_PING_URL");
if (!r.healthchecksConfigured) warn.push("NO_HEALTHCHECKS_WATCHDOG");
// 2. Declencheur
try {
var trig = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
r.triggers = trig;
var prod = trig.filter(function (h) { return h === "sentinelleProductionTick"; }).length;
if (prod === 0) issues.push("NO_PRODUCTION_TRIGGER");
if (prod > 1) issues.push("DUPLICATE_PRODUCTION_TRIGGERS");
if (trig.indexOf("sentinelleInstrumentedPilotCycle") !== -1) issues.push("EXPIRED_PILOT_TRIGGER");
} catch (e) { warn.push("TRIGGERS_UNREADABLE"); }
// 3. Fraicheur et sante
r.coreLastOkMinutesAgo = ageMin(get(DOOMSDAY_SENTINEL.lastOkKey));
r.detailLastOkMinutesAgo = ageMin(get(DOOMSDAY_BOOKING_V1.lastDetailOk));
if (r.coreLastOkMinutesAgo === null || r.coreLastOkMinutesAgo > 15) issues.push("CORE_CHECK_STALE");
if (r.detailLastOkMinutesAgo === null || r.detailLastOkMinutesAgo > 15) issues.push("DETAIL_CHECK_STALE");
r.coreFailures = Number(get(DOOMSDAY_SENTINEL.failureKey) || "0");
r.detailFailures = Number(get(DOOMSDAY_BOOKING_V1.detailFailures) || "0");
if (r.coreFailures > 0 || r.detailFailures > 0) warn.push("RECENT_FAILURES");
var auto = J("DOOMSDAY_LAST_AUTOMATIC_RUN_V1");
r.lastAutomaticRunMinutesAgo = auto ? ageMin(auto.atUtc) : null;
r.lastWatchdog = auto ? auto.watchdog : null;
if (r.lastAutomaticRunMinutesAgo === null || r.lastAutomaticRunMinutesAgo > 15) issues.push("TRIGGER_NOT_RUNNING");
// 4. File d'alertes et rappels
var outbox = J(DOOMSDAY_SENTINEL.outboxKey) || [];
r.pendingAlerts = outbox.length;
r.pendingChannels = outbox.map(function (o) { return o.pending; });
if (outbox.length) issues.push("ALERTS_NOT_DELIVERED");
var crit = J(DOOMSDAY_BOOKING_V1.criticalKey);
r.reminder = crit ? { acked: !!crit.acked, sent: crit.sent, armedMinutesAgo: ageMin(crit.armedAt), about: String(crit.summary || "").split("\n")[0] } : null;
try { r.mailQuotaLeftToday = MailApp.getRemainingDailyQuota(); if (r.mailQuotaLeftToday < 20) issues.push("MAIL_QUOTA_LOW"); } catch (_) { warn.push("MAIL_QUOTA_UNREADABLE"); }
// 5. Ce que la sentinelle a en memoire, date par date
var state = J(DOOMSDAY_SENTINEL.stateKey);
r.programmedDays = state && state.days ? state.days.map(function (d) { return d.date + " [" + d.tags.join(",") + "]"; }) : [];
r.sessionsByDate = {};
p.getKeys().filter(function (k) { return k.indexOf(DOOMSDAY_BOOKING_V1.detailsPrefix) === 0; }).sort().forEach(function (k) {
var snap = J(k) || [];
r.sessionsByDate[k.slice(DOOMSDAY_BOOKING_V1.detailsPrefix.length)] = snap.length + " séances, " +
snap.filter(function (x) { return x.open; }).length + " en vente, " + snap.filter(function (x) { return x.imax; }).length + " IMAX";
});
p.getKeys().filter(function (k) { return k.indexOf(DOOMSDAY_BOOKING_V1.anomalyPrefix) === 0 && get(k) === "reported"; })
.forEach(function (k) { warn.push("UNREADABLE_CONTENT_" + k.slice(DOOMSDAY_BOOKING_V1.anomalyPrefix.length)); });
// 6. Couverture : toutes les dates programmees sont-elles lues ?
try {
var dates = sentinelleDetailedDates_(state, null);
r.datesCheckedEachCycle = dates.length;
r.datesSkippedEachCycle = dates.skippedDates;
if (dates.coveragePartial) warn.push("ROTATING_COVERAGE");
(state && state.days ? state.days : []).forEach(function (d) { if (dates.indexOf(d.date) === -1 && !dates.coveragePartial) issues.push("DATE_NOT_COVERED_" + d.date); });
} catch (e) { issues.push("COVERAGE_ERROR"); }
// 7. Le patch remplace bien les bonnes fonctions
var mine = { sentinelleDetailedAlert_: "sentinelleImaxPriorityOn_", sentinelleListedAlert_: "sentinelleImaxAlert_",
sentinelleUncertainAlert_: "hasImax", sentinelleArmCritical_: "INFO (pas IMAX)", sentinelleSendMail_: "htmlBody",
sentinelleCriticalReminderTick_: "mailReminderSteps", sentinelleDetailedSmallSnapshot_: "sentinelleIsImax_",
sentinelleEventMessage_: "IMAX apparaît" };
var G = typeof globalThis !== "undefined" ? globalThis : (function () { return this; })();
Object.keys(mine).forEach(function (f) {
var fn = G[f];
if (typeof fn !== "function" || fn.toString().indexOf(mine[f]) === -1) issues.push("OVERRIDE_NOT_ACTIVE_" + f);
});
var loop = sentinelleCheckWithBookingOnce.toString();
["sentinelleDetailedAlert_(date, newSales)", "sentinelleArmCritical_(props, now, alert.body)",
"sentinelleListedAlert_(date, listed)", "sentinelleUncertainAlert_(date, uncertain)",
"sentinelleDetailedSmallSnapshot_(detail.sessions)", "sentinelleCriticalReminderTick_(props, now)"].forEach(function (needle) {
if (loop.indexOf(needle) === -1) issues.push("MAIN_LOOP_CHANGED: " + needle);
});
// 8. Simulation des alertes (sans envoi)
var imaxS = { localTime: "2026-12-18 20:00:00", version: "vostfr-ma", tags: ["DEFAULT", "IMAX-LASER"], auditorium: "7",
bookingUrl: "https://s.pathe.ma/fr/V5401S1/booking", status: "available" };
var stdS = { localTime: "2026-12-18 10:30:00", version: "vf-ma", tags: ["DEFAULT"], auditorium: "1",
bookingUrl: "https://s.pathe.ma/fr/V5401S2/booking", status: "available" };
var sim = {
open: sentinelleDetailedAlert_("2026-12-18", [stdS, imaxS]).subject,
std: sentinelleDetailedAlert_("2026-12-18", [stdS]).subject,
uncertain: sentinelleUncertainAlert_("2026-12-18", [imaxS]).subject,
programme: sentinelleEventMessage_({ type: "PROGRAMME_CHANGE", added: [], removed: [], totalDays: 1, firstObservation: false,
updated: [{ date: "2026-12-18", versions: ["vf-ma"], tags: ["DEFAULT", "imax"] }] }).subject
};
r.simulatedSubjects = sim;
if (sim.open.indexOf("IMAX OUVERT") === -1) issues.push("SIM_IMAX_OPEN");
if (sim.std.indexOf("pas IMAX") === -1) issues.push("SIM_STANDARD");
if (sim.uncertain.indexOf("IMAX") === -1) issues.push("SIM_UNCERTAIN");
if (sim.programme.indexOf("IMAX") === -1) issues.push("SIM_PROGRAMME");
// 9. Pathe repond-il en ce moment ? (lecture seule)
try {
var resp = UrlFetchApp.fetch(DOOMSDAY_SENTINEL.endpoint, { muteHttpExceptions: true, headers: { Accept: "application/json" } });
r.patheHttp = resp.getResponseCode();
if (r.patheHttp !== 200) issues.push("PATHE_HTTP_" + r.patheHttp);
else {
var live = sentinelleNormalize_(JSON.parse(resp.getContentText()));
r.patheLiveDays = live.days.length;
r.patheLiveImaxDays = live.days.filter(function (d) { return d.tags.concat(d.versions).some(function (t) { return /imax/i.test(t); }); }).map(function (d) { return d.date; });
}
} catch (e) { issues.push("PATHE_UNREADABLE"); }
// 10. Bot Telegram joignable ? (getMe, n'envoie rien)
if (r.telegramConfigured) {
try { r.telegramBotOk = !!sentinelleTelegramApi_(p, "getMe", {}); } catch (_) { r.telegramBotOk = false; warn.push("TELEGRAM_BOT_UNREACHABLE"); }
}
r.issues = issues; r.warnings = warn; r.ok = issues.length === 0;
console.log(JSON.stringify(r, null, 1));
return r;
}

