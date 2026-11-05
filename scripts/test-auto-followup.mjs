import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {queueFirstContacts,autoContactAllowed,autoContactQuota,autoContactKey,recordAutoFollowupResult}=await import(moduleURL('lib/auto-first-contact.ts'));
const {contactFollowup}=await import(moduleURL('lib/contact-followup.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),owner='winnie',now=new Date().toISOString(),sent=new Date(Date.now()-86400000-1000).toISOString();
for(const id of [owner,'other'])sql.prepare("INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,'sales','unused',?)").run(id,id,id,now);
const config={enabled:true,assigned_from:sent,options:['one','two','three'],followup_24h:true,whatsapp_daily_limit:20,email_daily_limit:10};
sql.prepare('INSERT INTO crm_cloud_settings VALUES(?,?,?,?)').run(autoContactKey(owner),JSON.stringify(config),now,owner);
sql.prepare('INSERT INTO crm_workbench_bridge(owner_id,token_hash,created_by,seen,status) VALUES(?,?,?,?,?)').run(owner,'unused',owner,Date.now(),JSON.stringify({whatsapp:true,email:true,autoFirstContact:true,autoFollowup24h:true}));
function seed(id,channel='whatsapp',extra={}){
 const detail={'偏好联系方式':channel};
 sql.prepare("INSERT INTO crm_leads(id,name,owner_id,source,detail,phone,email,country,fingerprint,created,cohort,status) VALUES(?,?,?,'Meta',?,'16145551234',?,'US',?,?,'new',?)").run(id,id,extra.owner||owner,JSON.stringify(detail),id+'@example.invalid',id,now,extra.status||'已联系待回复');
 sql.prepare('INSERT INTO crm_workbench_links VALUES(?,?,?,?,?)').run(id,extra.owner||owner,id,now,extra.owner||owner);
 if(!extra.first)note(id,channel,sent);
 return id;
}
function note(id,channel,at){sql.prepare("INSERT INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES(?,?,?,'发送已确认｜receipt',?,'',?)").run(id+':'+channel,id,owner,channel==='email'?'邮件':'WhatsApp',at);}
const jobs=()=>sql.prepare("SELECT * FROM crm_workbench_commands WHERE json_extract(payload,'$.auto_followup_24h')=1").all();
seed('both');note('both','email',sent);seed('reply');sql.prepare("INSERT INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES('reply-note','reply',?,'客户回复｜yes','客户回复','',?)").run(owner,now);
seed('early');sql.prepare("UPDATE crm_notes SET created=? WHERE lead_id='early'").run(new Date(Date.now()-86399000).toISOString());
seed('draft');sql.prepare('INSERT INTO crm_workbench_drafts VALUES(?,?,?,?,?,?,?)').run('draft','draft',owner,'邮件','human',now,owner);
seed('foreign','whatsapp',{owner:'other'});seed('held');sql.prepare("INSERT INTO crm_workbench_commands(id,owner_id,desktop_id,kind,payload,state,created,updated,actor_id) VALUES('hold',?,'held','send',?,'uncertain',?,?,?)").run(owner,JSON.stringify({crm_lead_id:'held',channel:'email'}),Date.now()-2*86400000,Date.now()-2*86400000,owner);
seed('to-email');seed('to-wa','email');
for(const [id,channel] of [['fresh-wa','whatsapp'],['fresh-mail','email']]){seed(id,channel,{first:true,status:'待首次联系'});sql.prepare('INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES(?,?,?,?,?,?)').run('assign-'+id,id,owner,owner,now,'full-first-v1');}
await queueFirstContacts(db,owner);
assert.deepEqual(jobs().map(j=>JSON.parse(j.payload).crm_lead_id).sort(),['to-email','to-wa']);
let emailJob=jobs().find(j=>JSON.parse(j.payload).channel==='email'),p=JSON.parse(emailJob.payload);
assert(await autoContactAllowed(db,owner,p));assert(!await autoContactAllowed(db,'other',p));
sql.prepare("UPDATE crm_leads SET status='正在沟通' WHERE id='to-email'").run();assert(!await autoContactAllowed(db,owner,p));sql.prepare("UPDATE crm_leads SET status='已联系待回复' WHERE id='to-email'").run();
sql.prepare("UPDATE crm_workbench_commands SET state='running' WHERE id=?").run(emailJob.id);assert(await autoContactAllowed(db,owner,p),'the job itself is ignored when rechecking pending sends');
await recordAutoFollowupResult(db,owner,emailJob,'uncertain',{error:'receipt missing'},now);
assert.equal(sql.prepare("SELECT next_date FROM crm_leads WHERE id='to-email'").get().next_date,'');
const value={status:'sent',messageId:'mail-receipt',sentAt:now};
await recordAutoFollowupResult(db,owner,emailJob,'done',value,now);
let lead=sql.prepare("SELECT * FROM crm_leads WHERE id='to-email'").get(),marker=JSON.parse(lead.detail)._auto_followup_24h;
assert.equal(Date.parse(marker.next_at)-Date.parse(now),7*86400000);assert(lead.next_date);
assert.equal(contactFollowup(lead,{whatsapp:sent,email:now},marker.next_at).kind,'followup','new 7 day work never becomes dormant');
await recordAutoFollowupResult(db,owner,emailJob,'done',value,now);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_notes WHERE id=?').get(emailJob.id+':result:done').n,1);
sql.prepare("UPDATE crm_workbench_commands SET state='done',result=? WHERE id=?").run(JSON.stringify(value),emailJob.id);note('to-email','email',now);
await queueFirstContacts(db,owner);assert.equal(jobs().length,2,'both contacted are excluded and jobs are idempotent');
for(let i=0;i<24;i++){seed('email-'+i);seed('wa-'+i,'email');}
await Promise.all([queueFirstContacts(db,owner),queueFirstContacts(db,owner)]);
const counts=Object.fromEntries(sql.prepare("SELECT json_extract(payload,'$.channel') channel,COUNT(*) n FROM crm_workbench_commands GROUP BY channel").all().map(r=>[r.channel,r.n]));
assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_workbench_commands WHERE json_extract(payload,'$.auto_first_contact')=1 AND COALESCE(json_extract(payload,'$.auto_followup_24h'),0)=0").get().n,2,'first contacts reserve the same quota as 24h followups');
assert.equal(counts.email,10,'pending/uncertain and completed sends share the 10 customer email limit');assert.equal(counts.whatsapp,20);
const before=sql.prepare('SELECT id,payload,state FROM crm_workbench_commands ORDER BY id').all();await queueFirstContacts(db,owner);assert.deepEqual(sql.prepare('SELECT id,payload,state FROM crm_workbench_commands ORDER BY id').all(),before);
assert(jobs().filter(j=>j.state==='queued').every(j=>JSON.parse(sql.prepare('SELECT detail FROM crm_leads WHERE id=?').get(JSON.parse(j.payload).crm_lead_id).detail)._auto_followup_24h.state==='queued'),'concurrent polls cannot overwrite queued work as quota-delayed');
assert(sql.prepare("SELECT COUNT(*) n FROM crm_notes WHERE content LIKE '今日自动联系额度已满%'").get().n>0,'quota delays are written to CRM');
assert(await autoContactQuota(db,owner,JSON.parse(jobs().find(j=>j.state==='queued').payload),jobs().find(j=>j.state==='queued').id));
const actual={id:'actual',status:'已联系待回复',email:'x@example.invalid',phone:'16145551234',detail:{'偏好联系方式':'WhatsApp'}};
assert.equal(contactFollowup(actual,{email:sent},now,true).alternate,'whatsapp','the actual successful channel controls the alternate, even if it differs from preference');
assert.equal(contactFollowup({...actual,detail:{}},{email:sent},now,true).alternate,'whatsapp');
assert.equal(contactFollowup(actual,{email:sent,whatsapp:sent},now,true),null);
assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
console.log('PASS: 24 hour success anchor, both directions, both-contacted/replied/early/draft/foreign/uncertain exclusions; concurrent shared 20/10 quotas, CRM queue/result/quota audit, receipt-based 7 day scheduling, no duplicate or premature success.');
