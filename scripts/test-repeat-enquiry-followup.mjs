import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {database,moduleURL} from './test-form-intake.mjs';
const {notificationEndpoint}=await import(moduleURL('lib/followup-notifications.ts'));
const {enquiryNotification}=await import(moduleURL('lib/lead-notifications.ts'));
const {digest}=await import(moduleURL('lib/crm.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),a={id:'a',role:'followup'},b={id:'b',role:'followup'},sales={id:'sales',role:'sales'};
for(const u of [a,b,sales]){
 sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-01-01');
 sql.prepare('INSERT INTO crm_sessions VALUES(?,?,?)').run(await digest('repeat-test-'+u.id),u.id,Date.now()+3600000);
 sql.prepare("INSERT INTO crm_leads(id,name,source,owner_id,entered,detail,fingerprint,created) VALUES(?,?,'Meta',?,'2026-10-01','{}',?,'2026-10-01')").run('lead-'+u.id,'customer-'+u.id,u.id,'lead-'+u.id);
 await enquiryNotification(db,'form:'+u.id,'lead-'+u.id,'客户再次提交了咨询，请跟进。').run();
 await enquiryNotification(db,'form:'+u.id,'lead-'+u.id,'客户再次提交了咨询，请跟进。').run();
}
assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_lead_notifications').get().n,3);
const inbox=await notificationEndpoint(db,a,a,'followup-notifications','GET',{});assert.equal(inbox.notifications.length,1);assert.equal(inbox.notifications[0].recipient_id,a.id);assert.equal(inbox.notifications[0].lead_id,null);assert.equal(inbox.notifications[0].read_at,'');assert.deepEqual(inbox.assignments,[]);
const other=await notificationEndpoint(db,b,b,'followup-notifications','GET',{});
await assert.rejects(notificationEndpoint(db,a,a,'followup-notifications/read','POST',{id:other.notifications[0].id}),e=>e.status===404);
await assert.rejects(notificationEndpoint(db,a,b,'followup-notifications/read-all','POST',{}),e=>e.status===403);
const dir=mkdtempSync(tmpdir()+'/repeat-enquiry-');
try{
 globalThis.__repeatEnquiryEnv={DB:db};
 await build({entryPoints:['app/api/[...path]/route.ts'],bundle:true,platform:'node',format:'esm',outfile:dir+'/route.mjs',plugins:[{name:'test-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__repeatEnquiryEnv;'}));}}],logLevel:'silent'});
 const route=await import(dir+'/route.mjs');
 const request=async(path,body)=>{const method=body?'POST':'GET';const r=await route[method](new Request('https://test/api/'+path,{method,headers:{origin:'https://test',cookie:'crm_session=repeat-test-a','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:await r.json()};};
 const delivered=await request('followup-notifications');assert.equal(delivered.status,200);assert.equal(delivered.data.notifications.length,1);assert.equal(delivered.data.notifications[0].lead_id,null);
 assert.equal((await request('leads/lead-a')).status,403,'A reminder must not grant customer access');
 assert.equal((await request('followup-notifications/audit')).status,403);
 assert.equal((await request('followup-notifications/read',{id:other.notifications[0].id})).status,404);
 assert.equal((await request('followup-notifications/read-all',{})).data.updated,1);
 assert(sql.prepare("SELECT read_at FROM crm_lead_notifications WHERE recipient_id='a'").get().read_at);
 assert.equal(sql.prepare("SELECT read_at FROM crm_lead_notifications WHERE recipient_id='b'").get().read_at,'');
 assert.equal((await request('followup-notifications/read-all',{})).data.updated,0);
}finally{rmSync(dir,{recursive:true,force:true});delete globalThis.__repeatEnquiryEnv;}
assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
console.log('PASS: repeat enquiries delivered once to original followup owner; real API inbox, read-all and read receipts; cross-account and audit isolation; customer access remains denied.');
