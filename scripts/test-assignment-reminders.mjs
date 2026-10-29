import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'assignment-reminders-'));
try{
 await build({entryPoints:['lib/assignment-reminders.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'m.mjs'),logLevel:'silent'});
 const {assignmentReminders,teamAssignmentSummary}=await import('file://'+join(dir,'m.mjs'));
 const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 const statement=(s,a=[])=>({bind:(...args)=>statement(s,args),all:async()=>({results:sql.prepare(s).all(...a)})});const db={prepare:s=>statement(s)};
 sql.exec("INSERT INTO crm_users(id,username,name,role,password,created) VALUES('a','a','A','sales','unused','now'),('b','b','B','sales','unused','now'); INSERT INTO crm_leads(id,name,source,owner_id,detail,fingerprint,created) VALUES('l','模拟','Meta','a','{}','x','2026-10-01'); INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created) VALUES('as','l','a','a','2026-10-02');");
 const a={id:'a',role:'sales'},b={id:'b',role:'sales'};
 assert.equal((await assignmentReminders(db,a)).length,1);assert.equal((await assignmentReminders(db,b)).length,0);
 assert.equal((await assignmentReminders(db,a)).length,1,'repeated reads do not resolve');
 sql.exec("UPDATE crm_leads SET status='正在沟通',last_contact='2026-10-03' WHERE id='l'");assert.equal((await assignmentReminders(db,a)).length,1,'status-only does not resolve');
 sql.exec("INSERT INTO crm_notes(id,lead_id,user_id,content,next_step,method,created) VALUES('old','l','a','old','','电话','2026-10-01'),('other','l','b','other','','电话','2026-10-03'),('empty','l','a','  ','','电话','2026-10-03')");assert.equal((await assignmentReminders(db,a)).length,1,'old/other/empty notes do not resolve');
 sql.exec("INSERT INTO crm_notes(id,lead_id,user_id,content,next_step,method,created) VALUES('valid','l','a','已联系确认需求','','电话','2026-10-03')");assert.equal((await assignmentReminders(db,a)).length,0);
 sql.exec("UPDATE crm_leads SET owner_id='b';INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created) VALUES('as2','l','a','b','2026-10-04')");assert.equal((await assignmentReminders(db,a)).length,0);assert.equal((await assignmentReminders(db,b)).length,1,'reassignment follows current owner');
 assert.equal((await assignmentReminders(db,{id:'b',role:'followup'})).length,0);
 const team=await teamAssignmentSummary(db,'2026-10');
 assert.equal(team.find(r=>r.id==='a').allocated,1);assert.equal(team.find(r=>r.id==='a').pending.length,0);
 assert.equal(team.find(r=>r.id==='b').allocated,1);assert.equal(team.find(r=>r.id==='b').pending_month,1);
 sql.exec("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created) VALUES('duplicate','l','a','b','2026-10-04'),('boundary','l','a','b','2026-10-31T16:30:00Z')");
 assert.equal((await teamAssignmentSummary(db,'2026-10','b'))[0].allocated,1,'deduplicates client per owner');
 assert.equal((await teamAssignmentSummary(db,'2026-11','b'))[0].allocated,1,'Beijing month boundary');
 assert.equal((await teamAssignmentSummary(db,'2026-09','b'))[0].pending.length,0,'later assignments excluded from selected month');
 const nov=(await teamAssignmentSummary(db,'2026-11','b'))[0];assert.equal(nov.pending_month,1);assert.equal(nov.pending_history,0);assert.equal(nov.pending_unknown,0);assert.equal(nov.pending[0].owner_name,'B');assert.equal(nov.pending[0].latest_note.content,'已联系确认需求');
 const dec=(await teamAssignmentSummary(db,'2026-12','b'))[0];assert.equal(dec.pending_history,1);assert.equal(dec.pending_month+dec.pending_history+dec.pending_unknown,dec.pending.length);
 sql.exec(`INSERT INTO crm_leads(id,name,source,owner_id,original_owner,detail,fingerprint,created) VALUES
 ('new','新分配','Meta','a','','{}','new','2026-10-01'),
 ('sheet','已标记同步','Meta','a','A','{}','sheet','2026-10-01'),
 ('legacy','旧版同步','Meta','a','A','{"分配同步来源":{"filename":"历史表格","row":2}}','legacy','2026-10-01'),
 ('unknown','无分配记录','Meta','a','A','{}','unknown','2026-10-01'),
 ('changed-owner','旧归属已转交','Meta','b','A','{"分配同步来源":{"filename":"历史表格","row":3}}','changed-owner','2026-10-01');
 INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES
 ('new-a','new','a','a','2026-10-02','equal-global-v1'),
 ('sheet-a','sheet','a','a','2026-10-02','historical-sheet-v1'),
 ('legacy-a','legacy','a','a','2026-10-02',''),
 ('changed-original','changed-owner','a','a','2026-10-02',''),
 ('changed-current','changed-owner','a','b','2026-10-03','');`);
 const before=sql.prepare('SELECT total_changes() AS n').get().n;
 const classified=await assignmentReminders(db,a);
 assert.deepEqual(Object.fromEntries(classified.map(l=>[l.id,l.assignment_category])),{new:'new',sheet:'historical',legacy:'historical',unknown:'unverified'});
 assert.equal(new Set(classified.map(l=>l.id)).size,classified.length,'category query does not duplicate leads');
 assert.equal((await assignmentReminders(db,b)).find(l=>l.id==='changed-owner').assignment_category,'new','old provenance must not label a different owner as historical sync');
 await teamAssignmentSummary(db,'2026-10');
 assert.equal(sql.prepare('SELECT total_changes() AS n').get().n,before,'classification and summaries only read existing data');
 sql.exec("INSERT INTO crm_notes(id,lead_id,user_id,content,next_step,method,created) VALUES('system-sync','sheet','a','同步归属','','归属核正','2026-10-03'),('confirmed-history','legacy','a','已核实并跟进','','电话','2026-10-03')");
 const after=await assignmentReminders(db,a);
 assert.ok(after.some(l=>l.id==='sheet'),'system sync is not follow-up evidence');assert.ok(!after.some(l=>l.id==='legacy'),'valid owner follow-up resolves historical group');
 sql.exec("UPDATE crm_leads SET owner_id='a' WHERE id='changed-owner';INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created) VALUES('changed-back','changed-owner','b','a','2026-10-04')");
 assert.equal((await assignmentReminders(db,a)).find(l=>l.id==='changed-owner').assignment_category,'new','returning to original owner must not reuse old sync provenance');
 sql.exec("UPDATE crm_leads SET review=1 WHERE id='unknown'");assert.ok(!(await assignmentReminders(db,a)).some(l=>l.id==='unknown'),'review exclusion remains unchanged');
 console.log('PASS: three exclusive categories, legacy sheet provenance, reassignment, follow-up evidence and read-only invariance.');
 console.log('PASS: ownership isolation, persistent reads, status-only changes, follow-up evidence, reassignment and followup role.');
}finally{rmSync(dir,{recursive:true,force:true});}
