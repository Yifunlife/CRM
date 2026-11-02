import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {database,moduleURL} from './test-form-intake.mjs';
const {salesMonitor}=await import(moduleURL('lib/sales-monitor.ts'));
const {salesHomeEndpoint}=await import(moduleURL('lib/sales-home-server.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
for(const [id,role] of [['boss','ceo'],['manager','management'],['rep','sales']])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,trade_scopes,created) VALUES(?,?,?,?,?,?,?)').run(id,id,id,role,'test-only','["foreign"]','2026-01-01');
for(const [id,owner,cohort,status,detail] of [
 ['rep-pending','rep','new','待首次联系',{}],
 ['manager-pending','manager','new','待首次联系',{}],
 ['manager-followed','manager','historical','正在沟通',{_sales_progress:{required:['email'],first:{email:{at:'2026-11-02T01:00:00Z',note:'已首次沟通'}},second:{}}}],
]){
 sql.prepare("INSERT INTO crm_leads(id,name,country,source,business_scope,owner_id,email,cohort,status,detail,fingerprint,entered,created) VALUES(?,?,'美国','Meta','meta-full',?,?,?, ?,?,?,?,?)").run(id,id,owner,id+'@test.invalid',cohort,status,JSON.stringify(detail),id,cohort==='historical'?'2026-10-20':'2026-11-01','2026-11-02');
 sql.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES(?,?,'boss',?,'2026-11-02T00:00:00Z','full-first-v1')").run(id,id,owner);
}
sql.exec("INSERT INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES('first-note','manager-followed','manager','已首次沟通','邮件','安排二次跟进','2026-11-02T01:00:00Z')");
const db=database(sql),before=sql.prepare('SELECT total_changes() n').get().n;
const monitor=await salesMonitor(db,undefined,{id:'boss',role:'ceo'},'sales-monitor','GET');
assert.equal(monitor.summary.customers,2,'Managers who receive leads must be included in first-contact supervision');
assert(monitor.items.some(i=>i.owner_id==='manager'&&i.id==='first:manager'));
const home=await salesHomeEndpoint(db,{id:'manager',role:'sales',personal_business:true},'sales-home','GET');
const followed=home.todos.find(r=>r.id==='manager-followed');
assert(followed,'A genuine new assignment of a historical customer must remain in follow-up work after the first recorded contact');
assert.equal(followed.second_due,'2026-11-09');
assert(followed.tags.includes('unscheduled'),'Missing next date must remain actionable');
assert.notEqual(followed.stage,'historical','Date cohort cannot replace the latest assignment provenance');
assert.equal(sql.prepare('SELECT total_changes() n').get().n,before,'All supervision and work reads remain read-only');
sql.close();console.log('PASS: receiving managers appear in supervision; assignment provenance survives completed first contact; second-contact and scheduling work remain visible.');
