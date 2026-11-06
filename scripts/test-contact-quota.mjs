import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {contactQuota}=await import(moduleURL('lib/auto-contact-quota.ts'));
const {queueFirstContacts,autoContactKey}=await import(moduleURL('lib/auto-first-contact.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),now=new Date().toISOString(),stamp=Date.now(),old=new Date(stamp-2*86400000).toISOString();
for(const owner of ['own','other'])sql.prepare("INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,'sales','unused',?)").run(owner,owner,owner,now);
const count=async(channel='email',exclude='')=>{const q=contactQuota('own',channel,now,exclude);return Number(Object.values(await db.prepare(q.sql).bind(...q.args).first())[0]);};
function seed(id,channel='email',cohort='new',first=true){sql.prepare("INSERT INTO crm_leads(id,name,owner_id,source,detail,email,phone,country,fingerprint,created,cohort,status) VALUES(?,?,'own','Meta',?,?,'16145551234','US',?,?,?,?)").run(id,id,JSON.stringify({'偏好联系方式':channel}),id+'@example.invalid',id,now,cohort,first?'待首次联系':'已联系待回复');sql.prepare("INSERT INTO crm_workbench_links VALUES(?,'own',?,?,'own')").run(id,id,now);if(!first)sql.prepare("INSERT INTO crm_notes(id,lead_id,user_id,method,content,next_step,created) VALUES(?,?,'own','WhatsApp','发送已确认｜prior receipt','',?)").run(id+':first',id,old);}
function job(id,state,status,extra={},channel='email',owner='own',created=stamp){sql.prepare("INSERT INTO crm_workbench_commands(id,owner_id,desktop_id,kind,payload,state,result,created,updated,actor_id) VALUES(?,?,?,'send',?,?,?,?,?,?)").run(id,owner,id,JSON.stringify({crm_lead_id:id,channel}),state,JSON.stringify({status,...extra}),created,created,owner);}
for(const [state,status] of [['failed',''],['cancelled',''],['done','skipped'],['done','not_sent'],['done','confirmed_not_sent'],['done','sent']]){const id=state+':'+status;seed(id);job(id,state,status);}
assert.equal(await count(),0,'failures, skips, cancellations, not-sent and missing receipts do not consume success quota');
seed('pending');job('pending','queued','');seed('running');job('running','running','');seed('uncertain');job('uncertain','uncertain','');assert.equal(await count(),3);assert.equal(await count('email','pending'),2);
seed('sent');job('sent','done','sent',{messageId:'receipt',sentAt:now});assert.equal(await count(),4);
sql.prepare("INSERT INTO crm_notes(id,lead_id,user_id,method,content,next_step,created) VALUES('online-sent','sent','own','邮件','线上发送已确认｜sent\n沟通凭据：message:email:receipt','',?)").run(now);assert.equal(await count(),4,'receipt and CRM note for the same customer count once');
seed('old');job('old','done','sent',{messageId:'old-receipt',sentAt:old});assert.equal(await count(),4,'an old successful send is not charged again');
job('foreign','done','sent',{messageId:'other',sentAt:now},'email','other');assert.equal(await count(),4,'another account cannot consume the workbench limit');
sql.exec('DELETE FROM crm_workbench_commands; DELETE FROM crm_notes; DELETE FROM crm_workbench_links; DELETE FROM crm_leads;');
seed('new-first');seed('new-second','whatsapp','new',false);seed('old-first','email','historical');seed('old-second','whatsapp','historical',false);
sql.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES('new','new-first','own','own',?,'full-first-v1')").run(now);
sql.prepare('INSERT INTO crm_cloud_settings VALUES(?,?,?,?)').run(autoContactKey('own'),JSON.stringify({enabled:true,assigned_from:old,options:['one','two','three'],followup_24h:true,whatsapp_daily_limit:1,email_daily_limit:1,historical_first_contact:{approved_at:now,lead_ids:['old-first']}}),now,'own');
sql.prepare('INSERT INTO crm_workbench_bridge(owner_id,token_hash,created_by,seen,status) VALUES(?,?,?,?,?)').run('own','unused','own',stamp,JSON.stringify({whatsapp:true,email:true,autoFirstContact:true,autoFollowup24h:true,autoHistoricalFirstContact:true}));
const pending=()=>sql.prepare("SELECT id,json_extract(payload,'$.crm_lead_id') lead_id FROM crm_workbench_commands WHERE state='queued'").all();
await Promise.all([queueFirstContacts(db,'own'),queueFirstContacts(db,'own')]);assert.deepEqual(pending().map(j=>j.lead_id),['new-first'],'new first contacts have priority over all historical customers');
sql.prepare("UPDATE crm_workbench_commands SET state='failed',result='{}' WHERE id=?").run(pending()[0].id);await queueFirstContacts(db,'own');assert.deepEqual(pending().map(j=>j.lead_id),['new-second'],'a confirmed failure releases the slot to another eligible new customer');
sql.prepare("UPDATE crm_workbench_commands SET state='done',result=? WHERE id=?").run(JSON.stringify({status:'skipped'}),pending()[0].id);await queueFirstContacts(db,'own');assert.deepEqual(pending().map(j=>j.lead_id),['old-first'],'historical first contact fills the remaining slot after eligible new customers');
sql.prepare("UPDATE crm_workbench_commands SET state='done',result=? WHERE id=?").run(JSON.stringify({status:'not_sent'}),pending()[0].id);await queueFirstContacts(db,'own');assert.deepEqual(pending().map(j=>j.lead_id),['old-second'],'not-sent results release the slot to another historical customer');
sql.prepare("UPDATE crm_workbench_commands SET state='done',result=? WHERE id=?").run(JSON.stringify({status:'sent',messageId:'last-receipt',sentAt:now}),pending()[0].id);await queueFirstContacts(db,'own');assert.equal(pending().length,0);assert.equal(await count(),1,'only actual successful customers satisfy the daily target');
console.log('PASS: successful-receipt daily quota, failed/skipped/not-sent refill, pending/running/uncertain reservations, customer deduplication, dates/account isolation, concurrent cap and new-before-historical priority.');
