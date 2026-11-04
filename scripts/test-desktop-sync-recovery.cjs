const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAccountSync}=require('./desktop-sync/account-sync.cjs');
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(t,options={}){
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:Date.parse('2026-11-05T00:00:00Z')});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-recovery-')),configFile=path.join(dir,'config.json');
 const config={accountSync:true,enabled:true,origin:'https://yifun-crm.yifunlife.workers.dev',owner_id:'fixture',token:'PRIVATE_TOKEN_61400000000',workspace:dir,localOwner:'Fixture',...options.config};fs.writeFileSync(configFile,JSON.stringify(config));
 let data={clients:[{id:'existing',name:'PRIVATE_CUSTOMER',owner:'Fixture',notes:'Preserved',email:'private@example.invalid'}]},changes=0;
 const value=()=>({owner_id:'fixture',updates:[],uploaded:[],conflicts:[],blocked:[]});
 const response=v=>({ok:true,status:200,headers:{get:()=>null},json:async()=>v||value()});
 const sync=createAccountSync({configFile,root:()=>dir,state:()=>structuredClone(data),save:v=>{changes++;data=v;},profile:c=>c,archive:()=>[],scenes:()=>[],request:async()=>response(),...options});
 t.after(()=>{sync.stop();fs.rmSync(dir,{recursive:true,force:true});});
 return {dir,configFile,sync,response,value,get data(){return data;},get changes(){return changes;},logs:()=>fs.readFileSync(path.join(dir,'.workbench/logs/crm-sync.jsonl'),'utf8')};
}
test('a hung request releases the cycle, backs off, retries and ignores the late result',async t=>{
 let release,calls=0;const f=fixture(t,{request:async()=>{calls++;if(calls===1)return new Promise(r=>release=r);return f.response();}});
 const run=f.sync.tick();await flush();assert.equal(calls,1);await f.sync.tick();assert.equal(calls,1);
 t.mock.timers.tick(45001);await flush();await run;assert.equal(f.sync.status().state,'retrying');assert.match(f.sync.error(),/超时/);await f.sync.tick();assert.equal(calls,1);
 t.mock.timers.tick(30000);await f.sync.tick();assert.equal(calls,2);assert.equal(f.sync.status().state,'idle');
 release(f.response({...f.value(),updates:[{lead_id:'late',desktop_id:'late',create:true,values:{name:'Do not import late'}}]}));await flush();assert.equal(f.changes,0);assert.equal(f.data.clients[0].notes,'Preserved');assert.match(f.logs(),/recovered/);assert.ok(!/PRIVATE_TOKEN|PRIVATE_CUSTOMER|private@example/.test(f.logs()));
});
test('timeout includes reading the response body, not only opening the connection',async t=>{
 const f=fixture(t,{request:async()=>({ok:true,status:200,json:()=>new Promise(()=>{})})});const run=f.sync.tick();await flush();t.mock.timers.tick(45001);await flush();await run;assert.equal(f.sync.status().state,'retrying');
});
test('stop and manual retry finish even if the request ignores AbortSignal',async t=>{
 let calls=0;const f=fixture(t,{request:async()=>{calls++;return calls===1?new Promise(()=>{}):f.response();}});void f.sync.tick();await flush();const retry=f.sync.retry();await flush();t.mock.timers.tick(10);await flush();await retry;await flush();assert.equal(calls,2);assert.equal(f.sync.status().state,'idle');assert.match(f.logs(),/cycle_cancelled/);
});
test('server failures keep safe diagnostics and recover; invalid authorization waits for user action',async t=>{
 let code=500;const f=fixture(t,{request:async()=>({ok:false,status:code,headers:{get:()=> '11111111-1111-1111-1111-111111111111'},json:async()=>({error:'PRIVATE_CUSTOMER private@example.invalid'})})});await f.sync.tick();assert.equal(f.sync.status().state,'retrying');assert.match(f.logs(),/11111111-1111-1111-1111-111111111111/);assert.ok(!f.logs().includes('PRIVATE_CUSTOMER'));
 code=401;t.mock.timers.tick(30000);await f.sync.tick();assert.equal(f.sync.status().state,'blocked');t.mock.timers.tick(300000);await f.sync.tick();assert.equal(f.sync.status().state,'blocked');assert.match(f.sync.error(),/授权/);
});
test('a cycle exceeding its total deadline is cancelled without writing client changes',async t=>{
 let calls=0;const f=fixture(t,{state:()=>{calls++;t.mock.timers.setTime(Date.now()+121000);return{clients:[]};}});await f.sync.tick();assert.equal(f.sync.status().state,'retrying');assert.equal(f.sync.status().errorCode,'cycle_timeout');assert.equal(f.changes,0);
});
test('history yields after eight requests and allows the next customer synchronization',async t=>{
 let catalogCalls=0,historyCalls=0;const clients=Array.from({length:10},(_,i)=>({id:'fixture-'+i,name:'Fixture',owner:'Fixture'}));
 const f=fixture(t,{config:{fullHistory:true},state:()=>({clients}),request:async(_url,o)=>{const b=JSON.parse(o.body);if(b.sync){catalogCalls++;return f.response();}historyCalls++;return f.response({revision:b.history.revision,received:b.history.offset+b.history.messages.length,complete:true});}});
 await f.sync.tick();assert.equal(catalogCalls,1);assert.equal(historyCalls,8);assert.equal(f.sync.status().pendingHistory,2);await f.sync.tick();assert.equal(catalogCalls,2);assert.equal(historyCalls,10);
});
test('workspace changes reject a late response and preserve original customer state',async t=>{
 let release,moved=false;const f=fixture(t,{root:()=>moved?f.dir+'-other':f.dir,request:()=>new Promise(r=>release=r)});const run=f.sync.tick();await flush();moved=true;release(f.response({...f.value(),updates:[{desktop_id:'existing',values:{name:'Wrong workspace'}}]}));await run;assert.equal(f.changes,0);
});
test('logging is private and bounded; status exposes no credential or customer data',async t=>{
 const f=fixture(t);await f.sync.tick();const file=path.join(f.dir,'.workbench/logs/crm-sync.jsonl');fs.writeFileSync(file,'x'.repeat(2097153));await f.sync.tick();assert.ok(fs.existsSync(file+'.1'));assert.equal(fs.statSync(file).mode&0o777,0o600);assert.ok(!/PRIVATE_TOKEN|PRIVATE_CUSTOMER|private@example/.test(JSON.stringify(f.sync.status())));
});
test('the interval recovers automatically after a hung request without a manual tick',async t=>{
 let calls=0;const f=fixture(t,{request:async()=>{calls++;return calls===1?new Promise(()=>{}):f.response();}});f.sync.start();await flush();t.mock.timers.tick(45001);await flush();assert.equal(f.sync.status().state,'retrying');t.mock.timers.tick(15000);await flush();assert.equal(calls,1);t.mock.timers.tick(30000);await flush();assert.equal(calls,2);assert.equal(f.sync.status().state,'idle');
});
test('connection testing also has a hard deadline and preserves saved configuration',async t=>{
 const {createConnectionSettings}=require('./desktop-sync/connection-settings.cjs');const f=fixture(t);const original=fs.readFileSync(f.configFile);
 const controls=createConnectionSettings({configFile:f.configFile,root:()=>f.dir,clients:()=>[],pause:async()=>{},start:()=>{},request:()=>new Promise(()=>{})});const result=controls.test({token:'a'.repeat(96)});const assertion=assert.rejects(result,/核对超时/);await flush();t.mock.timers.tick(15001);await assertion;assert.ok(fs.readFileSync(f.configFile).equals(original));
});
test('partial history and lost acknowledgments resume without dropping or duplicating messages',async t=>{
 const {synchronizeHistory}=require('./desktop-sync/crm-history-sync.cjs');const journal={},stored=new Map(),messages=Array.from({length:137},(_,i)=>({key:'message-'+i,text:'Retained text '+i,timestamp:'2026-11-05T00:00:00Z'}));let lose=true,checkpoints=0;
 const args={clients:[{id:'fixture'}],archive:()=>messages,journal,active:()=>true,checkpoint:()=>checkpoints++,post:async h=>{for(let i=0;i<h.messages.length;i++)stored.set(h.offset+i,h.messages[i].value);if(lose){lose=false;throw Error('simulated lost acknowledgment');}return{revision:h.revision,received:h.offset+h.messages.length,complete:h.offset+h.messages.length===messages.length};}};
 await assert.rejects(synchronizeHistory(args),/lost acknowledgment/);assert.equal(stored.size,50);await synchronizeHistory(args);assert.equal(stored.size,137);assert.equal(journal.history.fixture.complete,true);assert.equal(stored.get(136).text,messages[136].text);assert.equal(checkpoints,3);
});
