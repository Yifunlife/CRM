import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {moduleURL} from './test-form-intake.mjs';
const moduleUrl=(file,replacements={})=>{let source=readFileSync(file,'utf8');for(const [from,to] of Object.entries(replacements))source=source.replaceAll(from,to);return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');};
const errors='data:text/javascript,export class AllocationError extends Error {constructor(message,status=400){super(message);this.status=status;}}';
const storage='data:text/javascript,'+encodeURIComponent('export const readJson=async s=>JSON.parse(s);export const storeJson=async v=>JSON.stringify(v);');
const crm=moduleUrl('lib/crm.ts');
const autoUrl=moduleURL('lib/auto-first-contact.ts');
const {bridgeDeviceEndpoint}=await import(moduleUrl('lib/workbench-bridge.ts',{"'./operations-dashboard'":JSON.stringify(moduleURL('lib/operations-dashboard.ts')),"'./customer-analysis'":JSON.stringify("data:text/javascript,export const customerAnalysisEndpoint=()=>{throw Error('Covered by test-customer-analysis.mjs')};"),"'./contact-kind'":JSON.stringify(moduleURL('lib/contact-kind.ts')),"'./customer-code'":JSON.stringify(moduleURL('lib/customer-code.ts')),"'./customer-profile'":JSON.stringify(moduleURL('lib/customer-profile.ts')),"'./auto-first-contact'":JSON.stringify(autoUrl),"'./object-storage'":JSON.stringify(storage),"'./crm'":JSON.stringify(crm),"'./allocation-server'":JSON.stringify(errors)}));
const {digest}=await import(crm),sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}async run(){return {meta:sqlite.prepare(this.sql).run(...this.args)};}}
const db={prepare:sql=>new Statement(sql),batch:async s=>Promise.all(s.map(x=>x.run()))};
for(const [id,role] of [['mark','ceo'],['winnie','management'],['other','sales']])sqlite.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(id,id,id,role,'unchanged','2026-11-02');
for(const [id,owner,phone] of [['mark-lead','mark','61400000001'],['new-mark','mark','61400000002'],['other-lead','other','61400000003']])sqlite.prepare("INSERT INTO crm_leads(id,name,phone,owner_id,source,detail,fingerprint,created) VALUES(?,?,?,?,'Meta','{}',?,'2026-11-02')").run(id,id,phone,owner,id);
await db.prepare('INSERT INTO crm_workbench_bridge(owner_id,token_hash,created_by) VALUES(?,?,?)').bind('mark',await digest('mark-secret'),'mark').run();
const req=new Request('https://crm.test/api/bridge/poll',{headers:{Authorization:'Bearer mark-secret'}});
const run=sync=>bridgeDeviceEndpoint(db,req,{sync});
const local={id:'native-one',name:'mark-lead',whatsapp:'61400000001',country:'Australia',email:'',grade:'A',nextContact:'2026-11-10',messages:[{channel:'whatsapp',speaker:'Winnie Wu',text:'old history',outgoing:true}]};
let r=await run({clients:[local],bindings:[],scenes:[]});
assert.equal(r.owner_id,'mark');assert.equal(r.updates.length,2);assert.equal(r.updates.some(x=>x.lead_id==='other-lead'),false);assert.equal(r.updates.find(x=>x.lead_id==='mark-lead').desktop_id,'native-one');assert.equal(r.updates.find(x=>x.lead_id==='new-mark').desktop_id,'crm-new-mark');assert.equal(sqlite.prepare("SELECT count(*) n FROM crm_leads").get().n,3);assert.equal(sqlite.prepare('SELECT count(*) n FROM crm_notes').get().n,0,'historical data never becomes new follow-up');
for(let attempt=0;attempt<2;attempt++)await run({clients:[local],bindings:[],scenes:[]});
assert.equal(sqlite.prepare("SELECT country FROM crm_leads WHERE id='mark-lead'").get().country,'');assert.equal(sqlite.prepare("SELECT grade FROM crm_leads WHERE id='mark-lead'").get().grade,'','pull-only keeps empty online fields unchanged across repeated pulls');
const base=Object.fromEntries(Object.keys(r.updates[0].values).map(k=>[k,String(r.updates.find(x=>x.lead_id==='mark-lead').values[k]||'')]));
r=await run({clients:[local],bindings:[{lead_id:'mark-lead',desktop_id:'native-one',base}],scenes:[]});
assert.equal(sqlite.prepare("SELECT country FROM crm_leads WHERE id='mark-lead'").get().country,'Australia');
assert.equal(sqlite.prepare("SELECT grade FROM crm_leads WHERE id='mark-lead'").get().grade,'A');
const gradeBase={...r.updates.find(x=>x.lead_id==='mark-lead').values};
sqlite.prepare("UPDATE crm_leads SET grade='Yifun Staff' WHERE id='mark-lead'").run();
let staffSync=await run({clients:[local],bindings:[{lead_id:'mark-lead',desktop_id:'native-one',base:gradeBase}],scenes:[]});
assert.equal(sqlite.prepare("SELECT grade FROM crm_leads WHERE id='mark-lead'").get().grade,'Yifun Staff','a stale desktop grade cannot undo the web colleague classification');
assert.equal(staffSync.updates.find(x=>x.lead_id==='mark-lead').values.grade,'Yifun Staff');
sqlite.prepare("UPDATE crm_leads SET grade='A' WHERE id='mark-lead'").run();
const missing=await run({clients:[],bindings:[],scenes:[]});assert.equal(missing.updates.some(x=>x.lead_id==='mark-lead'),false,'missing linked client is not recreated');
const common=r.updates.find(x=>x.lead_id==='mark-lead').values;
sqlite.prepare("UPDATE crm_leads SET name='CRM changed' WHERE id='mark-lead'").run();
r=await run({clients:[{...local,name:'Local changed'}],bindings:[{lead_id:'mark-lead',desktop_id:'native-one',base:common}],scenes:[]});
assert.equal(sqlite.prepare("SELECT name FROM crm_leads WHERE id='mark-lead'").get().name,'CRM changed');assert.ok(r.conflicts.some(c=>c.field==='name'));
await run({clients:[local,{...local,id:'second-local'}],bindings:[],scenes:[]});
assert.equal(sqlite.prepare("SELECT count(*) n FROM crm_workbench_links WHERE lead_id='mark-lead'").get().n,1);
sqlite.prepare("UPDATE crm_leads SET owner_id='other' WHERE id='mark-lead'").run();
r=await run({clients:[{...local,name:'Must not update'}],bindings:[{lead_id:'mark-lead',desktop_id:'native-one',base:common}],scenes:[]});
assert.ok(r.blocked.includes('native-one'));assert.equal(r.updates.some(x=>x.lead_id==='mark-lead'),false);assert.equal(sqlite.prepare("SELECT name FROM crm_leads WHERE id='mark-lead'").get().name,'CRM changed');
assert.equal(JSON.parse(sqlite.prepare("SELECT payload FROM crm_workbench_snapshots WHERE owner_id='mark'").get().payload).clients.some(c=>c.id==='native-one'),false);
assert.equal(sqlite.prepare("SELECT count(*) n FROM crm_workbench_snapshots WHERE owner_id='winnie'").get().n,0);
sqlite.prepare("UPDATE crm_users SET active=0 WHERE id='mark'").run();await assert.rejects(run({clients:[],bindings:[],scenes:[]}),e=>e.status===401);
console.log('PASS: CEO own-account bootstrap, own CRM pull, exact association, idempotence, local update, conflict preservation, history suppression, transfer revocation, Winnie isolation, disabled account');

// A newly assigned, confirmed desktop client is contacted without opening a CRM page.
sqlite.prepare("UPDATE crm_users SET active=1 WHERE id='mark'").run();
const enabledAt=new Date(Date.now()-60000).toISOString(),assignedAt=new Date().toISOString();
sqlite.prepare("INSERT INTO crm_cloud_settings VALUES('auto-first-contact:mark',?,?,'mark')").run(JSON.stringify({enabled:true,assigned_from:enabledAt,options:['Approved one','Approved two','Approved three']}),enabledAt);
sqlite.prepare("INSERT INTO crm_leads(id,name,phone,owner_id,source,detail,fingerprint,created,status) VALUES('automatic-new','Automatic new','16145550009','mark','Meta','{\"偏好联系方式\":\"by_whats_app\"}','automatic-new',?,'待首次联系')").run(assignedAt);
sqlite.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES('automatic-assignment','automatic-new','mark','mark',?,'full-first-v1')").run(assignedAt);
await bridgeDeviceEndpoint(db,req,{heartbeat:true,status:{whatsapp:true,email:true,autoFirstContact:true}});
await run({clients:[{id:'automatic-desktop',name:'Automatic new',whatsapp:'16145550009',messages:[]}],bindings:[],scenes:[]});
const automatic=sqlite.prepare("SELECT * FROM crm_workbench_commands WHERE json_extract(payload,'$.auto_first_contact')=1").get();assert.equal(automatic.state,'queued');
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_lead_notifications').get().n,0,'queued automatic contact is not a sent notice');
sqlite.prepare('UPDATE crm_workbench_commands SET created=? WHERE id=?').run(Date.now()-120000,automatic.id);
const firstClaim=await bridgeDeviceEndpoint(db,req,{});assert.equal(firstClaim.command.id,automatic.id,'automatic work persists while the desktop is disconnected');
assert.equal((await bridgeDeviceEndpoint(db,req,{})).command,null,'a claimed send is never replayed');
await bridgeDeviceEndpoint(db,req,{result:{id:automatic.id,state:'done',value:{status:'sent',messageId:'verified-first-message',text:'Approved one'}}});
assert.equal(sqlite.prepare("SELECT status FROM crm_leads WHERE id='automatic-new'").get().status,'已联系待回复');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM crm_notes WHERE lead_id='automatic-new'").get().n,1);
const sentNotice=sqlite.prepare("SELECT * FROM crm_lead_notifications WHERE lead_id='automatic-new'").get();
assert.equal(sentNotice.title,'已发送信息 · Automatic new');assert.equal(sentNotice.content,'工作台已通过WhatsApp发送信息。');assert.equal(sentNotice.recipient_id,'mark');assert.equal(sentNotice.read_at,'');assert.equal(sentNotice.created,sqlite.prepare("SELECT last_contact FROM crm_leads WHERE id='automatic-new'").get().last_contact);
await bridgeDeviceEndpoint(db,req,{result:{id:automatic.id,state:'done',value:{status:'sent',messageId:'verified-first-message',text:'Approved one'}}});
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM crm_notes WHERE lead_id='automatic-new'").get().n,1);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_lead_notifications').get().n,1,'replayed success creates one notification');
await run({clients:[{id:'automatic-desktop',name:'Automatic new',whatsapp:'16145550009',messages:[]}],bindings:[],scenes:[]});
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM crm_workbench_commands WHERE json_extract(payload,'$.auto_first_contact')=1").get().n,1);
console.log('PASS: background sync queues automatic first contact, offline persistence, single claim, confirmed receipt updates contact state once, no repeat on subsequent sync');

// Notifications follow confirmed outgoing contact, with the same inbox permissions and read controls.
const {notificationEndpoint}=await import(moduleURL('lib/followup-notifications.ts'));
for(const [suffix,state,value,expected] of [
 ['failed','failed',{error:'not sent'},1],
 ['uncertain','uncertain',{status:'uncertain'},1],
 ['skipped','done',{status:'skipped'},1],
 ['missing-receipt','done',{status:'sent'},1],
 ['email','done',{status:'confirmed_sent',messageId:'verified-email',text:'Approved email'},2],
]){
 const jobId='notice-'+suffix,payload={...JSON.parse(automatic.payload),channel:'email'};
 sqlite.prepare("INSERT INTO crm_workbench_commands(id,owner_id,desktop_id,kind,payload,state,created,updated,actor_id) VALUES(?,'mark','automatic-desktop','send',?,'running',?,?,'mark')").run(jobId,JSON.stringify(payload),Date.now(),Date.now());
 await bridgeDeviceEndpoint(db,req,{result:{id:jobId,state,value}});
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_lead_notifications').get().n,expected,suffix+' notification count');
}
assert.equal(sqlite.prepare("SELECT content FROM crm_lead_notifications WHERE content LIKE '%邮件%'").get().content,'工作台已通过邮件发送信息。');
const markUser={id:'mark',role:'ceo'},otherUser={id:'other',role:'sales'};
let inbox=await notificationEndpoint(db,markUser,markUser,'followup-notifications','GET',{});assert.equal(inbox.notifications.length,2);
assert.equal((await notificationEndpoint(db,otherUser,otherUser,'followup-notifications','GET',{})).notifications.length,0);
await assert.rejects(notificationEndpoint(db,otherUser,otherUser,'followup-notifications/read','POST',{id:sentNotice.id}),e=>e.status===404);
await notificationEndpoint(db,markUser,markUser,'followup-notifications/read','POST',{id:sentNotice.id});
assert.ok(sqlite.prepare('SELECT read_at FROM crm_lead_notifications WHERE id=?').get(sentNotice.id).read_at);
assert.equal((await notificationEndpoint(db,markUser,markUser,'followup-notifications/read-all','POST',{})).updated,1);
console.log('PASS: WhatsApp/email sent notices, duplicate/failed/uncertain/skipped/missing-receipt suppression, recipient isolation and read controls');
const receipt={requestId:'desktop-auto-receipt',clientId:'automatic-desktop',channel:'whatsapp',recipient:'16145550009',status:'sent',confirmation:'Verified desktop send',confirmedAt:new Date(Date.now()-1000).toISOString()};
for(let i=0;i<2;i++)await bridgeDeviceEndpoint(db,req,{contact_receipts:[receipt]});
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_lead_notifications').get().n,3,'desktop receipts also produce one sent notice');
assert.equal(sqlite.prepare('SELECT created FROM crm_lead_notifications WHERE created=?').get(receipt.confirmedAt).created,receipt.confirmedAt);
sqlite.prepare("UPDATE crm_leads SET owner_id='other' WHERE id='automatic-new'").run();
await assert.rejects(bridgeDeviceEndpoint(db,req,{contact_receipts:[{...receipt,requestId:'after-transfer'}]}),e=>e.status===403);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_lead_notifications').get().n,3,'a transferred lead cannot create a previous-owner notice');
console.log('PASS: desktop receipt notification, confirmed timestamp, replay suppression and transfer revocation');

// An already queued job must be rejected at dispatch even if classification bypassed the save API.
sqlite.prepare("INSERT INTO crm_leads(id,name,phone,owner_id,source,detail,fingerprint,created,status) VALUES('revoked-colleague','Colleague','16145550010','mark','Meta','{\"偏好联系方式\":\"by_whats_app\"}','revoked-colleague',?,'待首次联系')").run(assignedAt);
sqlite.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES('revoked-assignment','revoked-colleague','mark','mark',?,'full-first-v1')").run(assignedAt);
await run({clients:[{id:'colleague-desktop',name:'Colleague',whatsapp:'16145550010',grade:'D',messages:[]}],bindings:[],scenes:[]});
assert.equal(sqlite.prepare("SELECT state FROM crm_workbench_commands WHERE json_extract(payload,'$.crm_lead_id')='revoked-colleague'").get().state,'queued');
sqlite.prepare("UPDATE crm_leads SET grade='Yifun Staff' WHERE id='revoked-colleague'").run();
assert.equal((await bridgeDeviceEndpoint(db,req,{})).command,null);
assert.equal(sqlite.prepare("SELECT state FROM crm_workbench_commands WHERE json_extract(payload,'$.crm_lead_id')='revoked-colleague'").get().state,'failed');
console.log('PASS: web colleague classification survives stale sync; queued colleague first contact cannot be dispatched.');
