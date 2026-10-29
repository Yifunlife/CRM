import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const cache=new Map();
export function moduleURL(file){file=resolve(file);if(cache.has(file))return cache.get(file);let source=readFileSync(file,'utf8');source=source.replace(/from (['"])([^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(p.startsWith('.')?moduleURL(resolve(dirname(file),p+'.ts')):import.meta.resolve(p)));const url='data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');cache.set(file,url);return url;}
export function database(sql){
 class Statement{constructor(query,args=[]){this.query=query;this.args=args;}bind(...args){return new Statement(this.query,args);}async first(){return sql.prepare(this.query).get(...this.args)||null;}async all(){return {results:sql.prepare(this.query).all(...this.args)};}async run(){return {meta:sql.prepare(this.query).run(...this.args)};}}
 return {prepare:q=>new Statement(q),batch:async statements=>{sql.exec('BEGIN');try{const result=statements.map(s=>({meta:sql.prepare(s.query).run(...s.args)}));sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
if(process.argv[1]!==resolve('scripts/test-form-intake.mjs')){}else{
const {importForms}=await import(moduleURL('lib/form-intake.ts'));
const {syncGoogleForms,sydneyCutoff}=await import(moduleURL('lib/google-form-sync.ts'));
const {notificationEndpoint}=await import(moduleURL('lib/followup-notifications.ts'));
const {digest}=await import(moduleURL('lib/crm.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),admin={id:'admin',role:'admin'},a={id:'a',role:'sales'},b={id:'b',role:'sales'};
for(const u of [admin,a,b])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-01-01');
sql.prepare('INSERT INTO crm_allocation_configs VALUES(?,?,?,?)').run('all',JSON.stringify({members:[{user_id:'a',state:'参与',share:50},{user_id:'b',state:'参与',share:50}],rule:{automatic:true}}),'now','admin');
const row=(id,email,created='2026-10-28T05:00:00-05:00',extra={})=>({id,form_id:'f:test',form_name:'【全案客资】多个单选-含国家',full_name:id,work_email:email,work_phone_number:'',created_time:created,country:'US',...extra});
const count=table=>sql.prepare('SELECT COUNT(*) n FROM '+table).get().n;
const first=row('early','ONE@example.com','2026-10-27T18:00:00-05:00');
const late=row('late','one@example.com','2026-10-28T06:00:00-05:00',{full_name:'Different name'});
const before=count('crm_leads');const preview=await importForms(db,[late,first],'admin',{preview:true});assert.equal(preview.inserted,1);assert.equal(count('crm_leads'),before);assert.equal(count('crm_notes'),0);
let result=await importForms(db,[late,first,row('second','second@example.com')],'admin');
assert.equal(result.inserted,2);assert.equal(result.repeated,1);assert.equal(result.autoAssigned,2);assert.equal(count('crm_leads'),2);assert.equal(count('crm_assignments'),2);assert.equal(count('crm_notes'),3);assert.equal(count('crm_lead_notifications'),1);
const lead=sql.prepare("SELECT * FROM crm_leads WHERE name='early'").get();assert.equal(lead.entered,'2026-10-27T23:00:00.000Z');assert.equal(lead.email,'ONE@example.com');assert.equal(lead.owner_id,'a');
const immutable=JSON.stringify(sql.prepare('SELECT * FROM crm_leads ORDER BY id').all());
result=await importForms(db,[first,late,row('again',' one@example.com ')],'admin');assert.equal(result.inserted,0);assert.equal(result.repeated,1);assert.equal(count('crm_assignments'),2);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM crm_leads ORDER BY id').all()),immutable);
const noteCount=count('crm_notes'),noticeCount=count('crm_lead_notifications');await importForms(db,[first,late,row('again','one@example.com')],'admin');assert.equal(count('crm_notes'),noteCount);assert.equal(count('crm_lead_notifications'),noticeCount);
let inbox=await notificationEndpoint(db,a,a,'followup-notifications','GET',{});assert.equal(inbox.notifications.length,2);assert.equal((await notificationEndpoint(db,b,b,'followup-notifications','GET',{})).notifications.length,0);
await assert.rejects(notificationEndpoint(db,b,b,'followup-notifications/read','POST',{id:inbox.notifications[0].id}),e=>e.status===404);
await notificationEndpoint(db,a,a,'followup-notifications/read','POST',{id:inbox.notifications[0].id});inbox=await notificationEndpoint(db,a,a,'followup-notifications','GET',{});assert.ok(inbox.notifications.find(n=>n.id===inbox.notifications.at(-1).id).read_at);
// Historical duplicate with no owner does not hide the assigned original.
sql.prepare("INSERT INTO crm_leads(id,name,email,source,detail,fingerprint,created,review) VALUES('old-copy','copy',?,'Meta','{}','old-copy','2020-01-01',1)").run('one@example.com');
result=await importForms(db,[row('old-repeat','one@example.com')],'admin');assert.equal(result.repeated,1);assert.equal(result.reviewed,0);
// Different historical owners must never be merged or alerted automatically.
sql.prepare("INSERT INTO crm_leads(id,name,email,source,owner_id,detail,fingerprint,created) VALUES('conflict','conflict',?,'Meta','b','{}','conflict','2020-01-01')").run('one@example.com');
const notices=count('crm_lead_notifications');result=await importForms(db,[row('conflicting','one@example.com')],'admin');assert.equal(result.reviewed,1);assert.equal(count('crm_lead_notifications'),notices);assert.equal(count('crm_customer_pool'),1);
// Exact legacy source ID is already processed even if it predates the submission ledger.
sql.prepare('UPDATE crm_leads SET fingerprint=? WHERE id=?').run(await digest('Meta:lead:legacy'),'old-copy');result=await importForms(db,[row('legacy','one@example.com')],'admin');assert.equal(result.skipped,1);
// A phone/email bridge groups all new rows before choosing the earliest record.
result=await importForms(db,[row('bridge1','bridge1@example.com','2026-10-28T01:00:00-05:00',{work_phone_number:'+1 555 222 3333'}),row('bridge2','bridge2@example.com','2026-10-28T02:00:00-05:00',{work_phone_number:'15552223333'}),row('bridge3','bridge2@example.com','2026-10-28T03:00:00-05:00')],'admin');assert.equal(result.inserted,1);assert.equal(result.repeated,2);assert.equal(result.autoAssigned,1);
// Same name without matching contacts stays separate.
result=await importForms(db,[row('name1','n1@example.com',undefined,{full_name:'Same'}),row('name2','n2@example.com',undefined,{full_name:'Same'})],'admin');assert.equal(result.inserted,2);
await assert.rejects(importForms(db,[row('bad','bad@example.com','2026-10-28')],'admin'),/时区/);
await assert.rejects(importForms(db,[row('denied','d@example.com')],'a'),e=>e.status===403);
sql.prepare("INSERT INTO crm_form_import_lock VALUES('meta','other',?)").run(Date.now()+60000);await assert.rejects(importForms(db,[row('lock','l@example.com')],'admin'),e=>e.status===409);sql.exec('DELETE FROM crm_form_import_lock');
const concurrent=await Promise.allSettled([importForms(db,[row('race1','race@example.com')],'admin'),importForms(db,[row('race2','race@example.com')],'admin')]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_leads WHERE email='race@example.com'").get().n,1);
// Cutoff is exclusive; DST follows Sydney and daily completion prevents a second run.
assert.equal(sydneyCutoff('2026-10-28T21:00:00Z'),'2026-10-28T21:00:00.000Z');assert.equal(sydneyCutoff('2026-07-01T22:00:00Z'),'2026-07-01T22:00:00.000Z');
sql.exec("INSERT INTO crm_google_form_sync(id,enabled,actor_id) VALUES('main',1,'admin')");
result=await syncGoogleForms(db,{at:'2026-10-28T21:00:00Z',rows:[row('pre','pre@example.com','2026-10-28T20:59:59Z'),row('boundary','boundary@example.com','2026-10-28T21:00:00Z')]});assert.equal(result.eligible,1);assert.equal(result.deferred,1);
assert.deepEqual(await syncGoogleForms(db,{at:'2026-10-28T21:05:00Z',rows:[]}),{skipped:true});assert.deepEqual(await syncGoogleForms(db,{at:'2026-10-28T22:00:00Z',rows:[]}),{skipped:true});
assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
console.log('PASS: earliest-first grouping, contact bridges, existing owner preservation, repeated enquiry history/inbox, idempotent replay, owner conflicts, permissions/read receipts, concurrent imports, exclusive Sydney cutoff and one daily run.');
}
