#!/usr/bin/env node
"use strict";
// Computes the code fingerprint that sentinelleDeploymentReport() prints in
// Apps Script, using the SAME code path (vm + Utilities.computeDigest mock).
// Usage: node tools/compute_code_fingerprint.js
const fs=require("node:fs"),vm=require("node:vm"),crypto=require("node:crypto"),path=require("node:path");
const FILES=["sentinel","showtime_signal","booking_monitor","watchdog","pilot_metrics","production","deploy_check"];
function load(root){
  const env={console:{log(){}},Utilities:{DigestAlgorithm:{SHA_256:"SHA_256"},Charset:{UTF_8:"UTF_8"},
    computeDigest(_a,text){return Array.from(crypto.createHash("sha256").update(text,"utf8").digest()).map(b=>b>127?b-256:b);}}};
  vm.createContext(env);
  for(const f of FILES) vm.runInContext(fs.readFileSync(path.join(root,"tools","google_apps_script_"+f+".gs"),"utf8"),env);
  return env;
}
function topLevelFunctions(root){
  const names=[];
  for(const f of FILES) for(const m of fs.readFileSync(path.join(root,"tools","google_apps_script_"+f+".gs"),"utf8").matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)) names.push(m[1]);
  return names;
}
module.exports={load,topLevelFunctions,FILES};
if(require.main===module){
  const env=load(path.resolve(__dirname,".."));
  console.log(env.sentinelleCodeFingerprint_());
}
