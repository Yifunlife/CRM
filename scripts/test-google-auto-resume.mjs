import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {database,moduleURL} from './test-form-intake.mjs';

const {syncGoogleForms}=await import(moduleURL('lib/google-form-sync.ts'));
const {importForms}=await import(moduleURL('lib/form-intake.ts'));
const {distribute}=await import(moduleURL('lib/allocation-server.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),start='2026-11-01T21:00:00.000Z',cutoff='2026-11-02T21:00:00.000Z';
for(const id of ['admin','a','b','leave','disabled'])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,active,created) VALUES(?,?,?,?,?,?,?)').run(id,id,id,id==='admin'?'admin':'sales','unused',id==='disabled'?0:1,'2026-01-01');
const config={members:[{user_id:'a',state:'参与'},{user_id:'b',state:'参与'},{user_id:'leave',state:'请假'},{user_id:'disabled',state:'参与'}],rule:{automatic:true}};
sql.prepare("INSERT INTO crm_allocation_configs VALUES('all',?,'now','admin')").run(JSON.stringify(config));
sql.prepare("INSERT INTO crm_google_form_sync(id,enabled,actor_id,last_cutoff) VALUES('main',1,'admin',?)").run(start);
const row=(id,at,full=false,email=id+'@test.invalid')=>({id,form_id:'test',form_name:full?'全案':'玩具号',created_time:at,full_name:id,work_email:email,work_phone_number:''});
const seed=(id,owner=null,cohort='new')=>sql.prepare("INSERT INTO crm_leads(id,name,email,source,business_scope,entered,cohort,owner_id,fingerprint,created,detail) VALUES(?,?,?,?,?,?,?,?,?,?,'{}')").run(id,id,id+'@test.invalid','Meta','meta-full',cohort==='new'?'2026-11-01':'2026-10-01',cohort,owner,id,'2026-11-01');
seed('owned','b');seed('historical',null,'historical');seed('previously-assigned');
sql.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES('previous','previously-assigned','admin','a','2026-11-01','full-first-v1')").run();
const before=sql.prepare("SELECT * FROM crm_leads WHERE id IN ('owned','historical','previously-assigned') ORDER BY id").all();
assert.equal(await distribute(db,['historical','previously-assigned'],'all','admin'),0,'Historical and previously assigned leads cannot be reassigned');
const rows=[row('old','2026-11-01T20:59:59Z',true),row('new',start,true),row('repeat','2026-11-02T01:00:00Z',true,'owned@test.invalid'),row('history-repeat','2026-11-02T02:00:00Z',true,'historical@test.invalid'),row('next',cutoff,true)];
let result=await syncGoogleForms(db,{manual:true,at:'2026-11-02T22:00:00Z',rows});
assert.equal(result.inserted,1);assert.equal(result.autoAssigned,1);assert.equal(result.repeated,1);assert.equal(result.reviewed,1);assert.equal(result.ignoredBeforeStart,1);assert.equal(result.deferred,1);
assert.deepEqual(sql.prepare("SELECT * FROM crm_leads WHERE id IN ('owned','historical','previously-assigned') ORDER BY id").all(),before);
assert.equal(sql.prepare("SELECT last_cutoff FROM crm_google_form_sync").get().last_cutoff,cutoff);
assert.deepEqual(await syncGoogleForms(db,{at:cutoff,rows}),{skipped:true});
// A failed allocation retains its daily marker, so the same batch can retry safely.
config.rule.automatic=false;sql.prepare("UPDATE crm_allocation_configs SET payload=?").run(JSON.stringify(config));
const pending=row('pending','2026-11-03T01:00:00Z',true);
await assert.rejects(syncGoogleForms(db,{at:'2026-11-03T21:00:00Z',rows:[pending]}),/自动分配/);
assert.equal(sql.prepare('SELECT last_cutoff FROM crm_google_form_sync').get().last_cutoff,cutoff);
assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_leads WHERE email='pending@test.invalid'").get().n,1);
config.rule.automatic=true;sql.prepare("UPDATE crm_allocation_configs SET payload=?").run(JSON.stringify(config));
result=await syncGoogleForms(db,{at:'2026-11-03T21:05:00Z',rows:[pending]});assert.equal(result.inserted,0);assert.equal(result.autoAssigned,1);
assert.equal(Date.parse(result.cutoff)-Date.parse(result.start),86400000);
// A stale last-run marker must not expand today's intake into a historical catch-up.
sql.prepare("UPDATE crm_google_form_sync SET last_cutoff='2026-01-01T00:00:00Z'").run();
result=await syncGoogleForms(db,{at:'2026-11-04T21:00:00Z',rows:[row('stale','2026-11-02T22:00:00Z',true)]});assert.equal(result.eligible,0);assert.equal(result.ignoredBeforeStart,1);
for(const at of ['2026-10-03T21:00:00Z','2026-04-04T22:00:00Z']){result=await syncGoogleForms(db,{manual:true,preview:true,at,rows:[]});assert.equal(Date.parse(result.cutoff)-Date.parse(result.start),86400000);}
// Full leads from the entire batch must precede toys even across 40-lead transactions.
const many=[...Array.from({length:41},(_,i)=>row('toy-'+i,'2026-11-05T01:00:00Z')),...Array.from({length:4},(_,i)=>row('full-'+i,'2026-11-05T02:00:00Z',true))];
result=await importForms(db,many,'admin');assert.equal(result.autoAssigned,45);
const order=sql.prepare("SELECT l.business_scope FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE l.name LIKE 'toy-%' OR l.name LIKE 'full-%' ORDER BY a.rowid").all();
assert(order.slice(0,4).every(r=>r.business_scope==='meta-full'));assert(order.slice(4).every(r=>r.business_scope==='meta-product'));
const owners=sql.prepare("SELECT DISTINCT owner_id FROM crm_assignments WHERE owner_id IN ('leave','disabled')").all();assert.deepEqual(owners,[]);
// Cross-form duplicates are one full lead while keeping the original first enquiry.
result=await importForms(db,[row('mixed-toy','2026-11-05T03:00:00Z',false,'mixed@test.invalid'),row('mixed-full','2026-11-05T04:00:00Z',true,'mixed@test.invalid')],'admin');
assert.equal(result.inserted,1);assert.equal(result.autoAssigned,1);assert.equal(sql.prepare("SELECT business_scope FROM crm_leads WHERE email='mixed@test.invalid'").get().business_scope,'meta-full');
assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
console.log('PASS: exact 24-hour windows including DST and stale markers, no historical sweep/reassignment, original owners, safe same-batch retry, full-first across transaction chunks, cross-form full priority, leave/disabled exclusion.');
