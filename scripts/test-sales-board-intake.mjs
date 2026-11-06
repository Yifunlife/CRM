import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {salesBoardIntake}=await import(moduleURL('lib/sales-board-intake.ts'));
const {salesBoardEndpoint}=await import(moduleURL('lib/sales-board-server.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql);
for(const id of ['admin','a','b'])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,active,trade_scopes,created) VALUES(?,?,?,?,?,1,?,?)').run(id,id,id,id==='admin'?'admin':'sales','unused','["domestic","foreign"]','2026-01-01');
function lead(id,{owner='a',market='外贸',date='2026-11-02',wb=false,review=0,grade='',detail={},fingerprint}={}){
 sql.prepare('INSERT INTO crm_leads(id,name,source,owner_id,entered,created,detail,fingerprint,market,review,grade,original_owner) VALUES(?,?,\'WhatsApp\',?,?,?,?,?,?,?,?,?)').run(id,id,owner,date,date,JSON.stringify({...detail,...(wb?{_workbench:{owner_id:'a',desktop_id:id}}:{})}),fingerprint||(wb?'workbench:':'form:')+id,market,review,grade,detail['分配同步来源']?'A':'');
}
function assign(id,l,{owner='a',at='2026-11-02T00:00:00Z',policy='full-first-v1'}={}){sql.prepare('INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES(?,?,\'admin\',?,?,?)').run(id,l,owner,at,policy);}
lead('system',{wb:true,fingerprint:'form:system'});assign('system','system');assign('repeat','system');
lead('boundary');assign('boundary','boundary',{at:'2026-10-31T16:00:00Z'});
lead('previous');assign('previous','previous',{at:'2026-10-31T15:59:59Z'});
lead('transfer',{owner:'b'});assign('transfer-a','transfer');assign('transfer-b','transfer',{owner:'b'});
lead('old-received',{date:'2025-01-01'});assign('old-received','old-received');
lead('direct',{wb:true});lead('direct-copy',{wb:true});
lead('prior-wb',{wb:true,date:'2026/10/31'});
lead('future-wb',{wb:true,date:'2026-11-07'});
lead('future-assigned');assign('future-assigned','future-assigned',{at:'2026-11-06T16:00:00Z'});
lead('review',{wb:true,review:1});assign('review','review');
lead('colleague',{wb:true,grade:'Yifun Staff'});assign('colleague','colleague');
lead('unproven',{detail:{_workbench:{owner_id:'a'}}});
lead('direct-allocated',{wb:true});assign('direct-allocated','direct-allocated');
lead('direct-domestic',{market:'内贸',wb:true});
lead('withdrawn',{wb:true});assign('withdrawn','withdrawn');
sql.prepare("INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) VALUES('allocation-withdrawn:withdrawn','撤销客资分配','withdrawn','{}','2026-11-02','admin')").run();
for(const policy of ['test-simulation','historical-sheet-v1','historical-alignment','historical-sync']){lead(policy);assign(policy,policy,{policy});}
lead('legacy',{detail:{分配同步来源:{sheet:'旧表'}}});assign('legacy','legacy',{policy:''});
lead('invalid-date');assign('invalid-date','invalid-date',{at:'invalid'});
lead('existing-subject',{date:'2025-01-01'});lead('new-wb-old-subject',{wb:true});
lead('linked-system');assign('linked-system','linked-system');lead('linked-wb',{wb:true});
for(const [id,members] of [['direct',['direct','direct-copy']],['old',['existing-subject','new-wb-old-subject']],['system',['linked-system','linked-wb']]]){
 sql.prepare("INSERT INTO crm_customer_subjects(id,code,kind,name,created,created_by,updated,updated_by) VALUES(?,?,'公司',?,'2026-01-01','admin','2026-01-01','admin')").run(id,id,id);
 for(const member of members)sql.prepare("INSERT INTO crm_customer_subject_links(lead_id,subject_id,reason,created,created_by) VALUES(?,?,'已核对','2026-01-01','admin')").run(member,id);
}
const snapshot=()=>JSON.stringify(['crm_leads','crm_assignments','crm_customer_subject_links','crm_workflow_audit'].map(t=>sql.prepare('SELECT * FROM '+t+' ORDER BY 1').all()));
const before=snapshot(),changes=sql.prepare('SELECT total_changes() n').get().n;
const rows=await salesBoardIntake(db,'2026-11','2026-11-06');
assert.deepEqual(rows.find(r=>r.id==='a'&&r.currency==='USD'),{id:'a',currency:'USD',system_customers:6,other_customers:2});
assert.deepEqual(rows.find(r=>r.id==='b'&&r.currency==='USD'),{id:'b',currency:'USD',system_customers:1,other_customers:0});
assert.deepEqual(rows.find(r=>r.id==='a'&&r.currency==='CNY'),{id:'a',currency:'CNY',system_customers:0,other_customers:1});
const october=await salesBoardIntake(db,'2026-10','2026-11-06');assert.equal(october.find(r=>r.id==='a'&&r.currency==='USD').system_customers,1);assert.equal(october.find(r=>r.id==='a'&&r.currency==='USD').other_customers,1);
const url=new URL('https://test/api/sales-board/report?period=month&month=2026-11');
const report=await salesBoardEndpoint(db,{id:'a',role:'sales',active:1},'sales-board/report','GET',url);
for(const row of report.monthly.rows){assert.equal(typeof row.system_customers,'number');assert.equal(typeof row.other_customers,'number');assert(!('fingerprint' in row));assert(!('workbench_owner' in row));}
assert.equal(snapshot(),before);assert.equal(sql.prepare('SELECT total_changes() n').get().n,changes);assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
console.log('PASS monthly board intake: system receipt dates and Beijing boundaries; workbench-created provenance; repeat and linked-customer deduplication; transfers; original acquisition month; future/review/colleague/history/simulation/withdrawn exclusions; market separation; safe numeric projection and no writes.');
