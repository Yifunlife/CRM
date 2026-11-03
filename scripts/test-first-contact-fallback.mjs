import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {queueFirstContacts,autoContactAllowed,autoContactKey}=await import(moduleURL('lib/auto-first-contact.ts'));
const sql=new DatabaseSync(':memory:');
for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+name,'utf8'));
const db=database(sql),owner='winnie',at='2026-11-02T12:00:00.000Z';
sql.prepare("INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,'sales','unused',?)").run(owner,owner,owner,at);
function config(fallback=true){sql.prepare('INSERT OR REPLACE INTO crm_cloud_settings VALUES(?,?,?,?)').run(autoContactKey(owner),JSON.stringify({enabled:true,assigned_from:at,options:['one','two','three'],whatsapp_fallback_email:fallback}),at,owner);}
config();sql.prepare('INSERT INTO crm_workbench_bridge(owner_id,token_hash,created_by,seen,status) VALUES(?,?,?,?,?)').run(owner,'unused',owner,Date.now(),JSON.stringify({whatsapp:true,email:true,autoFirstContact:true}));
async function seed(id){
 sql.prepare("INSERT INTO crm_leads(id,name,phone,email,country,source,owner_id,detail,fingerprint,created) VALUES(?,?,?,?,'GB','Meta',?,?,?,?)").run(id,id,'+6289673668830',id+'@example.invalid',owner,JSON.stringify({'偏好联系方式':'whatsapp'}),id,at);
 sql.prepare('INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES(?,?,?,?,?,?)').run('a-'+id,id,owner,owner,at,'full-first-v1');
 sql.prepare('INSERT INTO crm_workbench_links VALUES(?,?,?,?,?)').run(id,owner,'desktop-'+id,at,owner);
 await queueFirstContacts(db,owner);
 return sql.prepare("SELECT * FROM crm_workbench_commands WHERE json_extract(payload,'$.crm_lead_id')=? AND json_extract(payload,'$.channel')='whatsapp'").get(id);
}
function result(job,state,value){sql.prepare('UPDATE crm_workbench_commands SET state=?,result=? WHERE id=?').run(state,JSON.stringify(value),job.id);}
function emails(id){return sql.prepare("SELECT * FROM crm_workbench_commands WHERE json_extract(payload,'$.crm_lead_id')=? AND json_extract(payload,'$.channel')='email'").all(id);}
const invalid=await seed('invalid');result(invalid,'failed',{error:'号码国际格式待核实'});await queueFirstContacts(db,owner);
assert.equal(emails('invalid').length,1);const fallback=JSON.parse(emails('invalid')[0].payload);assert.equal(fallback.fallback_from,'whatsapp');assert.equal(fallback.option,-1);assert(await autoContactAllowed(db,owner,fallback));
await queueFirstContacts(db,owner);assert.equal(emails('invalid').length,1,'fallback is queued only once');
sql.prepare("UPDATE crm_leads SET phone='+447911123456' WHERE id='invalid'").run();assert(!await autoContactAllowed(db,owner,fallback),'changing the phone revokes failure proof');
const unregistered=await seed('unregistered');result(unregistered,'done',{status:'not_sent',detail:'号码未注册'});await queueFirstContacts(db,owner);assert.equal(emails('unregistered').length,1);
const uncertain=await seed('uncertain');result(uncertain,'uncertain',{status:'uncertain'});await queueFirstContacts(db,owner);assert.equal(emails('uncertain').length,0);
const unknown=await seed('unknown');result(unknown,'failed',{error:'发送结果待核实'});await queueFirstContacts(db,owner);assert.equal(emails('unknown').length,0);
const sent=await seed('sent');result(sent,'done',{status:'sent',messageId:'real-receipt'});await queueFirstContacts(db,owner);assert.equal(emails('sent').length,0);
const manual=await seed('manual');result(manual,'failed',{error:'国家或号码格式尚不能可靠核对'});sql.prepare('INSERT INTO crm_workbench_drafts VALUES(?,?,?,?,?,?,?)').run('draft','manual',owner,'邮件','human draft',at,owner);await queueFirstContacts(db,owner);assert.equal(emails('manual').length,0);
const disabled=await seed('disabled');result(disabled,'failed',{error:'号码国际格式待核实'});config(false);await queueFirstContacts(db,owner);assert.equal(emails('disabled').length,0,'fallback requires approval for this account');config();
const missing=await seed('missing');result(missing,'failed',{error:'号码国际格式待核实'});sql.prepare("UPDATE crm_leads SET email='' WHERE id='missing'").run();await queueFirstContacts(db,owner);assert.equal(emails('missing').length,0);
config(false);const corrected=await seed('corrected-phone');result(corrected,'failed',{error:'号码国际格式待核实'});sql.prepare("UPDATE crm_leads SET phone='+447911123456' WHERE id='corrected-phone'").run();await queueFirstContacts(db,owner);assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_workbench_commands WHERE json_extract(payload,'$.crm_lead_id')='corrected-phone'").get().n,2,'a corrected number can retry a confirmed pre-send failure');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_notes').get().n,0,'queueing never invents contact notes');
console.log('PASS: confirmed pre-send failure falls back once, not-registered fallback, uncertain/sent/draft blocks, account flag and current identity checks');
