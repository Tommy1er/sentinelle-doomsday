"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("tools/google_apps_script_sentinel.gs", "utf8");
const state = new Map();
const log = [];
let apiBody = {};
let apiStatus = 200;
let telegramCount = 0;
let gmailCount = 0;
let gmailFails = false;
const scriptProps = {
  getProperty(key) { return state.has(key) ? state.get(key) : null; },
  setProperty(key, value) { state.set(key, String(value)); }
};
state.set("ALERT_EMAIL_TO", "test@example.invalid");
state.set("TG_BOT_TOKEN", "NOT_A_REAL_SECRET");
state.set("TG_CHAT_ID", "11111111");
const env = {
  console: { log(x) { log.push(x); } },
  PropertiesService: { getScriptProperties() { return scriptProps; } },
  LockService: { getScriptLock() { return { tryLock() { return true; }, releaseLock() {} }; } },
  UrlFetchApp: {
    fetch(url, options) {
      if (url.includes("api.telegram.org")) {
        telegramCount++;
        return { getResponseCode() { return 200; }, getContentText() { return JSON.stringify({ok:true}); } };
      }
      assert.equal(url, "https://www.pathe.ma/api/show/avengers-doomsday-55389/cinemas");
      return {
        getResponseCode() { return apiStatus; },
        getContentText() { return JSON.stringify(apiBody); }
      };
    }
  },
  MailApp: { sendEmail(email) {
    assert.equal(email.to, "test@example.invalid");
    if (gmailFails) throw new Error("simulated mail failure");
    gmailCount++;
  } }
};
vm.createContext(env);
vm.runInContext(source, env);

const cal = "cinema-pathe-californie";
const rab = "cinema-pathe-dar-essalam";
const day = (versions = ["vf-ma"], tags = ["DEFAULT"]) => ({ versions, tags });
const putApi = (obj) => { apiBody=obj; apiStatus=200; };
function check() { return env.sentinelleCheckOnce(); }
function assertPending(pending) {
  const entries = JSON.parse(state.get("DOOMSDAY_MONITOR_OUTBOX_V1"));
  assert.equal(entries.length,pending);
}
assert.equal(env.testSentinelleParserFixture(), true);

// Baseline: no film programme at any cinema, no alerts.
putApi({});
assert.equal(check().status, "NO_PROGRAMME_FOR_CINEMA");
assert.equal(telegramCount,0);
assert.equal(gmailCount,0);

// Programming only at a different cinema must not trigger the user.
putApi({ [rab]: { days: { "2026-12-16": day() } } });
assert.equal(check().change,false);
assert.equal(telegramCount,0);

// New cinema-scoped programming triggers two independent notifications.
putApi({ [cal]: { days: { "2026-12-16": day(["vostfr-ma","vf-ma"],["pmr","DEFAULT"]) } } });
assert.equal(check().change,true);
assert.equal(telegramCount,1);
assert.equal(gmailCount,1);
assertPending(0);

// Reordering tags/versions and changing unrelated cinema does not alert.
putApi({
  [cal]: { days: { "2026-12-16": day(["vf-ma","vostfr-ma"],["DEFAULT","pmr"]) } },
  [rab]: { days: { "2026-12-16": day(["vostfr-ma"],["vip_fr"]) } }
});
assert.equal(check().change,false);
assert.equal(telegramCount,1);
assert.equal(gmailCount,1);

// Gmail fails independently. Telegram sent only once; then Gmail recovered.
gmailFails = true;
putApi({ [cal]: { days: { "2026-12-16": day(["vf-ma","vostfr-ma","en"],["DEFAULT","pmr"]) } } });
assert.equal(check().change,true);
assert.equal(telegramCount,2);
assert.equal(gmailCount,1);
assertPending(1);
gmailFails = false;
assert.equal(check().change,false);
assert.equal(telegramCount,2);
assert.equal(gmailCount,2);
assertPending(0);

// Bad API status must not be interpreted as empty programme.
apiStatus=403;
for (let i=0;i<3;i++) assert.throws(check,/HTTP 403/);
assert.equal(telegramCount,3);
assert.equal(gmailCount,3);
assert.equal(Number(state.get("DOOMSDAY_MONITOR_FAILURES_V1")),3);
assertPending(0);

// Recovery with existing date is not a false "new programming" event.
apiStatus=200;
assert.equal(check().change,false);
assert.equal(Number(state.get("DOOMSDAY_MONITOR_FAILURES_V1")),0);
assert.equal(telegramCount,3);
assert.equal(gmailCount,3);

console.log("PASS: offline Google Apps Script API, independence, persistence, failure and recovery fixtures");
