"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const state = new Map();
let api = {};
let apiStatus = 200;
let telegram = 0, emails = 0;
const props = {
  getProperty(k) { return state.has(k) ? state.get(k) : null; },
  setProperty(k, v) { state.set(k, String(v)); }
};
state.set("TG_BOT_TOKEN", "TEST_NO_SECRET");
state.set("TG_CHAT_ID", "1000");
state.set("ALERT_EMAIL_TO", "test@example.invalid");
const env = {
  console: { log() {} },
  PropertiesService: { getScriptProperties() { return props; } },
  LockService: { getScriptLock() { return { tryLock() { return true; }, releaseLock() {} }; } },
  UrlFetchApp: { fetch(url) {
    if (url.includes("api.telegram.org")) {
      telegram++;
      return { getResponseCode() { return 200; }, getContentText() { return '{"ok":true}'; } };
    }
    return { getResponseCode() { return apiStatus; }, getContentText() { return JSON.stringify(api); } };
  } },
  MailApp: { sendEmail() { emails++; } }
};
vm.createContext(env);
vm.runInContext(fs.readFileSync("tools/google_apps_script_sentinel.gs","utf8"),env);
const cal = "cinema-pathe-californie";
const other = "cinema-pathe-dar-essalam";
const day = { versions: ["vf-ma"], tags: ["DEFAULT"] };

function check(payload) { api=payload; apiStatus=200; return env.sentinelleCheckOnce(); }
function readState() { return JSON.parse(state.get("DOOMSDAY_MONITOR_STATE_V1")); }

// A 200 OK error wrapper must NOT silently become 'no programme'.
assert.throws(() => env.sentinelleNormalize_({ error: "upstream unavailable" }), /Unexpected API root schema/);
assert.throws(() => env.sentinelleNormalize_({ status: "ok", data: {} }), /Unexpected API root schema/);
assert.throws(() => env.sentinelleNormalize_({ [cal]: null }), /Null target cinema data/);
assert.equal(env.sentinelleNormalize_({ [other]: { days: {} } }).status, "NO_PROGRAMME_FOR_CINEMA");

// Start with empty known baseline.
assert.equal(check({}).status,"NO_PROGRAMME_FOR_CINEMA");
assert.equal(telegram,0);
assert.equal(emails,0);
// A newly programmed date must notify immediately, not after two polls.
assert.equal(check({ [cal]: { days: { "2026-12-16": day } } }).change,true);
assert.equal(telegram,1);
assert.equal(emails,1);

// One transient 200 {} after a non-empty programme must not erase the state
// or generate a false "removed" alert.
assert.equal(check({}).status,"PENDING_EMPTY_CONFIRMATION");
assert.equal(readState().days.length,1);
assert.equal(telegram,1);
assert.equal(emails,1);

// A restored positive cancels the empty streak.
assert.equal(check({ [cal]: { days: { "2026-12-16": day } } }).change,false);
assert.equal(Number(state.get("DOOMSDAY_MONITOR_EMPTY_STREAK_V1")),0);
assert.equal(check({}).status,"PENDING_EMPTY_CONFIRMATION");
assert.equal(telegram,1);
// A second consecutive empty observation confirms actual removal.
const confirmed=check({});
assert.equal(confirmed.status,"NO_PROGRAMME_FOR_CINEMA");
assert.equal(confirmed.change,true);
assert.equal(telegram,2);
assert.equal(emails,2);

// Malformed 200 API response must preserve the last valid baseline.
assert.throws(()=>check({error:"maintenance"}),/Unexpected API root schema/);
assert.equal(readState().days.length,0);

// Extreme backlog: even if notifications are undeliverable, a new alert must
// not exhaust the 9-KB per-property limit and permanently brick the monitor.
for(let i=0;i<10;i++) {
  env.sentinelleEnqueue_(props,"TEST " + i, "界".repeat(2400));
}
const queue=JSON.parse(state.get("DOOMSDAY_MONITOR_OUTBOX_V1"));
const bytes=Buffer.byteLength(state.get("DOOMSDAY_MONITOR_OUTBOX_V1"),"utf8");
assert.ok(queue.length<=4,"outbox bounded");
assert.ok(bytes<9000,"outbox must fit Apps Script property value cap");
assert.ok(queue[queue.length-1].body.includes("https://www.pathe.ma/"),"latest alert keeps the official URL");
console.log("PASS: schema fail-closed, empty debounce, immediate positives, bounded UTF-8 outbox");

// 2026-11-20 fail-open additions
{
  const extra = env.sentinelleNormalize_({ meta: { v: 2 }, "cinema-pathe-californie": { days: {
    "2026-12-16": { versions: ["vf-ma"], tags: ["imax"], specialShowtime: true } } } });
  assert.equal(extra.days.length, 1, "extra root field next to our cinema must not blind the monitor");
  assert.equal(extra.days[0].special, true);
  const plain = env.sentinelleNormalize_({ "cinema-pathe-californie": { days: {
    "2026-12-16": { versions: ["vf-ma"], tags: [], specialShowtime: false } } } });
  assert.equal("special" in plain.days[0], false, "unchanged snapshot shape when not special");
  console.log("PASS: extra root keys tolerated with target cinema; avant-première flag kept");
}
