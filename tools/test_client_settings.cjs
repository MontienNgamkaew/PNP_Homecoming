// Verify the actual SPA loader avoids repeated QR downloads and refreshes changed settings.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('prototype/app.js','utf8');
const source=app.slice(app.indexOf('async function loadSettings()'),app.indexOf('\nasync function route()'));
let remote={revision:1,table:2500,qr:{}},probeStatus=200,calls=[];
const context=vm.createContext({fetch:async url=>{calls.push(url);const probe=url.endsWith('/revision');return {ok:!probe||probeStatus===200,status:probe?probeStatus:200,json:async()=>JSON.parse(JSON.stringify(probe?{revision:remote.revision}:remote))};}});
vm.runInContext('let settings={};\n'+source,context);
(async()=>{
 await context.loadSettings();assert.deepEqual(calls,['/api/settings']);
 calls=[];await context.loadSettings();assert.deepEqual(calls,['/api/settings/revision']);
 remote={revision:2,table:2600,qr:{}};calls=[];await context.loadSettings();assert.deepEqual(calls,['/api/settings/revision','/api/settings']);assert.equal(vm.runInContext('settings.table',context),2600);
 probeStatus=503;await assert.rejects(()=>context.loadSettings());
 probeStatus=404;calls=[];await context.loadSettings();assert.deepEqual(calls,['/api/settings/revision','/api/settings']);
 console.log('Client settings loader: initial load, unchanged, changed, failure and legacy fallback passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
