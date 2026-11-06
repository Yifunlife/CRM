import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {queueFirstContacts,autoContactKey}=await import(moduleURL('lib/auto-first-contact.ts'));
const {intakeDay,backfillReady}=await import(moduleURL('lib/auto-contact-intake.ts'));
const {contactLimit}=await import(moduleURL('lib/auto-contact-quota.ts'));
const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),night='2026-11-06T16:00:00.000Z',morning='2026-11-06T21:02:00.000Z',old='2026-11-05T21:00:00.000Z';
sql.prepare("INSERT INTO crm_users(id,username,name,role,password,created) VALUES('own','own','Own','sales','unused',?)").run(old);
const config={enabled:true,assigned_from:'2026-11-01T16:00:00Z',options:['one','two','three'],followup_24h:true,wait_for_daily_intake:true,whatsapp_daily_limit:2,email_daily_limit:2};
sql.prepare('INSERT INTO crm_cloud_settings VALUES(?,?,?,?)').run(autoContactKey('own'),JSON.stringify(config),old,'own');
sql.prepare("INSERT INTO crm_workbench_bridge(owner_id,token_hash,created_by,seen,status) VALUES('own','unused','own',?,?)").run(Date.now(),JSON.stringify({autoFirstContact:true,autoFollowup24h:true,autoHistoricalFirstContact:true,whatsapp:true,email:true}));
function seed(id,at,cohort='new',first=true){sql.prepare("INSERT INTO crm_leads(id,name,owner_id,source,detail,email,phone,country,fingerprint,created,cohort,status) VALUES(?,?,'own','Meta','{\"偏好联系方式\":\"whatsapp\"}',?,'16145551234','US',?,?,?,?)").run(id,id,id+'@example.invalid',id,at,cohort,first?'待首次联系':'已联系待回复');sql.prepare("INSERT INTO crm_workbench_links VALUES(?,'own',?,?,'own')").run(id,id,at);sql.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES(?,?,'own','own',?,'full-first-v1')").run('a-'+id,id,at);if(!first)sql.prepare("INSERT INTO crm_notes(id,lead_id,user_id,method,content,next_step,created) VALUES(?,?,'own','WhatsApp','发送已确认｜receipt','',?)").run('n-'+id,id,old);}
seed('carried-first',old);seed('old-followup',old,'historical',false);
assert(!await backfillReady(db,'own',night));await queueFirstContacts(db,'own',night);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_workbench_commands').get().n,0,'03:00 must not consume the new day quota on old contacts');
const p={auto_first_contact:true,crm_lead_id:'carried-first',name:'carried-first',country:'US',channel:'whatsapp',recipient_key:'16145551234',assignment_id:'a-carried-first',assigned_at:old,text:'one'};
sql.prepare("INSERT INTO crm_workbench_commands(id,owner_id,desktop_id,kind,payload,state,created,updated,actor_id) VALUES('stale','own','carried-first','send',?,'queued',?,?,'own')").run(JSON.stringify(p),Date.parse(old),Date.parse(old));
await queueFirstContacts(db,'own',night);assert.equal(sql.prepare("SELECT state FROM crm_workbench_commands WHERE id='stale'").get().state,'deferred','an offline previous-day queue must also wait');
const cutoff=intakeDay(morning).cutoff;sql.prepare("INSERT INTO crm_batches(id,filename,source,created,creator,total) VALUES('today',?,'Meta',?,'own',1)").run('Google表单｜截止 '+cutoff,cutoff);
sql.prepare("INSERT INTO crm_form_import_lock VALUES('meta','processing',?)").run(Date.parse(morning)+60000);assert(!await backfillReady(db,'own',morning),'a batch still importing is not complete');sql.exec('DELETE FROM crm_form_import_lock');
seed('today-new','2026-11-06T21:01:00.000Z');await queueFirstContacts(db,'own',morning);
const pending=()=>sql.prepare("SELECT id,json_extract(payload,'$.crm_lead_id') lead_id FROM crm_workbench_commands WHERE state='queued'").all();assert.deepEqual(pending().map(j=>j.lead_id),['today-new']);assert.equal(sql.prepare("SELECT state FROM crm_workbench_commands WHERE id='stale'").get().state,'deferred');assert(!await backfillReady(db,'own',morning),'history remains paused while new-customer commands are pending');
sql.prepare("UPDATE crm_workbench_commands SET state='done',result=? WHERE id=?").run(JSON.stringify({status:'sent',messageId:'new-receipt',sentAt:morning}),pending()[0].id);sql.prepare("UPDATE crm_leads SET status='已联系待回复',last_contact=? WHERE id='today-new'").run(morning);
assert(await backfillReady(db,'own',morning));await queueFirstContacts(db,'own',morning);assert(pending().some(j=>j.id==='stale'),'old reservations resume only after the new customer is processed');assert(pending().some(j=>j.lead_id==='old-followup'));
const override={whatsapp_daily_limit:20,email_daily_limit:10,extra_new_intake:{date:'2026-11-07',lead_ids:['approved']}};
assert.equal(contactLimit(override,'whatsapp',morning,'approved'),21);assert.equal(contactLimit(override,'email',morning,'approved'),11);assert.equal(contactLimit(override,'whatsapp',morning,'other'),20);assert.equal(contactLimit(override,'whatsapp','2026-11-07T21:00:00Z','approved'),20);assert.equal(override.whatsapp_daily_limit,20);
for(const at of ['2026-07-01T00:00:00Z','2026-10-04T00:00:00Z','2026-04-05T00:00:00Z']){const day=intakeDay(at),fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Australia/Sydney',hourCycle:'h23',hour:'2-digit',minute:'2-digit'});assert.equal(fmt.format(new Date(day.start)),'00:00');assert.equal(fmt.format(new Date(day.cutoff)),'08:00');}
console.log('PASS: no overnight historical sends, daily intake completion and lock checks, new-customer completion barrier, safe deferral/resumption, approved lead/date-only extra quota and Sydney DST boundaries.');
