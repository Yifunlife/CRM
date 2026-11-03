import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {database,moduleURL} from './test-form-intake.mjs';
const {cloudEndpoint,cloudWebhook}=await import(moduleURL('lib/cloud-communication.ts'));
const {retryCompanyCloudIntake}=await import(moduleURL('lib/company-cloud-intake.ts'));
const {linkedEndpoint}=await import(moduleURL('lib/linked-whatsapp.ts'));
const {assignmentReminders}=await import(moduleURL('lib/assignment-reminders.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),env={CLOUD_COMMUNICATION_KEY:btoa('x'.repeat(32))},admin={id:'admin',role:'admin'},alice={id:'alice',role:'sales'},bob={id:'bob',role:'sales'},ceo={id:'ceo',role:'ceo'};
for(const u of [admin,alice,bob,ceo])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-11-03');
const config={members:[alice,bob].map(u=>({user_id:u.id,state:'参与',share:50})),rule:{automatic:false}};
sql.prepare('INSERT INTO crm_allocation_configs VALUES(?,?,?,?)').run('all',JSON.stringify(config),'now','admin');
const saveConfig=()=>sql.prepare("UPDATE crm_allocation_configs SET payload=? WHERE scope='all'").run(JSON.stringify(config));
const call=(path,body,user=admin,actor=user)=>cloudEndpoint(db,env,user,actor,'cloud/'+path.split('?')[0],body===undefined?'GET':'POST',body||{},new URL('https://crm.test/api/cloud/'+path));
const realFetch=globalThis.fetch;let providerCalls=[];
globalThis.fetch=async(url)=>{url=String(url);providerCalls.push(url);if(url.includes('oauth/access_token'))return Response.json({access_token:'fake-token'});if(url.includes('/phone_numbers'))return Response.json({data:[{id:'12345',display_phone_number:'+61000000000'}]});if(url.includes('?fields=is_on_biz_app'))return Response.json({platform_type:'CLOUD_API',is_on_biz_app:true});if(url.includes('/subscribed_apps'))return Response.json({success:true});throw Error('Unexpected external operation');};
async function hook(value,phone='12345',waba='987',valid=true){
 const body=JSON.stringify({object:'whatsapp_business_account',entry:[{id:waba,changes:[{field:'messages',value:{metadata:{phone_number_id:phone},...value}}]}]});
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('fake-meta-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('hex');
 return cloudWebhook(db,env,new Request('https://crm.test/api/cloud/webhook',{method:'POST',body,headers:{'x-hub-signature-256':'sha256='+(valid?sig:'0'.repeat(64))}}));
}
let sequence=0;const incoming=(peer,text='Looking for a play area',extra={})=>({id:'wamid.company.'+(++sequence),from:peer,timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:text},...extra});
const count=table=>sql.prepare('SELECT COUNT(*) n FROM '+table).get().n;
const contact=peer=>sql.prepare('SELECT * FROM crm_service_contacts WHERE owner_id=? AND peer=?').get(admin.id,peer);
const lead=peer=>sql.prepare('SELECT * FROM crm_leads WHERE phone=?').get(peer);
try{
 await call('settings',{metaAppId:'123',metaSecret:'fake-meta-secret',metaConfigId:'456'});
 await assert.rejects(call('connect/start',{},admin,alice),e=>e.status===403);
 await assert.rejects(call('connect/start',{},ceo),e=>e.status===403);
 sql.prepare("INSERT INTO crm_linked_devices(owner_id,token_hash,phone,status,desired,seen) VALUES('admin','fake-linked-hash','61000000000','connected','idle',?)").run(Date.now());
 assert.equal((await call('company-status')).linkedConflict,true);
 await assert.rejects(call('connect/start',{}),e=>e.status===409);
 sql.prepare("UPDATE crm_linked_devices SET desired='disconnect',status='connected' WHERE owner_id='admin'").run();
 const start=await call('connect/start',{});
 await call('connect/finish',{nonce:start.nonce,code:'fake',phone_id:'12345',waba_id:'987'});
 assert.equal((await call('status')).connection.active,1);
 await assert.rejects(linkedEndpoint(db,admin,admin,'linked/connect','POST',{}),e=>e.status===409);
 assert.equal((await call('company-status')).connection.active,1);
 assert.equal((await call('company-status',undefined,ceo)).connection.display_phone,'+61000000000');
 await assert.rejects(call('company-status',undefined,alice),e=>e.status===403);
 assert.ok(!providerCalls.some(url=>url.includes('smb_app_data')||url.endsWith('/messages')));
 const first=incoming('61400000001');
 await hook({contacts:[{wa_id:first.from,profile:{name:'真实客户姓名'}}],messages:[first]});
 assert.equal(lead(first.from).name,'真实客户姓名');assert.equal(lead(first.from).source,'WhatsApp');
 assert.equal(lead(first.from).owner_id,'alice');assert.equal(lead(first.from).status,'正在沟通');
 assert.equal(contact(first.from).state,'已分配');assert.equal(count('crm_assignments'),1);
 await hook({messages:[first,first]});
 assert.equal(count('crm_leads'),1);assert.equal(count('crm_notes'),1);assert.equal(count('crm_assignments'),1);assert.equal(count('crm_lead_notifications'),1);
 assert.equal((await assignmentReminders(db,alice)).length,1);
 await hook({messages:[incoming('61400000002')]});
 assert.equal(lead('61400000002').owner_id,'bob');
 const firstLead=lead(first.from);
 assert.equal((await call('messages?lead_id='+firstLead.id,undefined,alice)).messages.length,1);
 await assert.rejects(call('messages?lead_id='+firstLead.id,undefined,bob),e=>e.status===404);
 // Existing customers retain both ownership and original source, even on a new company enquiry.
 sql.prepare("INSERT INTO crm_leads(id,name,phone,owner_id,source,detail,fingerprint,created,status) VALUES('old','Original','+61 (400) 000-099','bob','Meta','{}','old','2020-01-01','已成交')").run();
 const before=count('crm_assignments');await hook({messages:[incoming('61400000099','Another enquiry')]});
 assert.equal(contact('61400000099').lead_id,'old');assert.equal(contact('61400000099').state,'已有客户');
 assert.equal(sql.prepare("SELECT source FROM crm_leads WHERE id='old'").get().source,'Meta');
 assert.equal(sql.prepare("SELECT status FROM crm_leads WHERE id='old'").get().status,'已成交');assert.equal(count('crm_assignments'),before);
 await hook({messages:[incoming(first.from,'',{type:'image',text:undefined,image:{id:'fake-media',caption:'Customer photo caption'}})]});
 assert.ok(sql.prepare('SELECT content FROM crm_cloud_messages WHERE provider_id=?').get('wamid.company.'+sequence).content.includes('Customer photo caption'));
 // Historical messages, outgoing echoes, invalid signatures, wrong WABA/phone never create leads.
 const leadsBefore=count('crm_leads');
 await hook({history:[{threads:[{id:'61400000080',messages:[incoming('61400000080')]}]}]});
 await hook({message_echoes:[incoming('61000000000','Outbound',{to:'61400000081'})]});
 assert.equal((await hook({messages:[incoming('61400000082')]},'12345','987',false)).status,403);
 await hook({messages:[incoming('61400000083')]},'12345','other-waba');await hook({messages:[incoming('61400000084')]},'unregistered');
 assert.equal(count('crm_leads'),leadsBefore);
 // No recipients: preserve all messages and the new lead; scheduled retry assigns once and replays the backlog.
 config.members.forEach(m=>m.state='暂停');saveConfig();
 const waiting='61400000003';await hook({messages:[incoming(waiting,'First'),incoming(waiting,'Second')]});
 assert.equal(lead(waiting).owner_id,null);assert.equal(contact(waiting).state,'待分配');assert.ok(contact(waiting).error);
 config.members.forEach(m=>m.state='参与');saveConfig();await retryCompanyCloudIntake(db);await retryCompanyCloudIntake(db);
 assert.equal(contact(waiting).state,'已分配');assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments WHERE lead_id=?').get(lead(waiting).id).n,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_notes WHERE lead_id=?').get(lead(waiting).id).n,2);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_lead_notifications WHERE lead_id=?').get(lead(waiting).id).n,2);
 // Duplicate phone records, review flags, and inactive owners are held without reassignment.
 for(const id of ['duplicate1','duplicate2'])sql.prepare("INSERT INTO crm_leads(id,name,phone,owner_id,source,detail,fingerprint,created) VALUES(?,?,'61400000088','bob','Meta','{}',?,'2020-01-01')").run(id,id,id);
 const existing=count('crm_leads'),assigned=count('crm_assignments');await hook({messages:[incoming('61400000088')]});
 assert.equal(contact('61400000088').state,'待核查');assert.equal(count('crm_leads'),existing);assert.equal(count('crm_assignments'),assigned);
 sql.prepare("INSERT INTO crm_leads(id,name,phone,source,detail,fingerprint,review,created) VALUES('review','Review','61400000089','Meta','{}','review',1,'2020-01-01')").run();
 await hook({messages:[incoming('61400000089')]});assert.equal(contact('61400000089').state,'待核查');
 sql.prepare("UPDATE crm_users SET active=0 WHERE id='bob'").run();await hook({messages:[incoming('61400000099')]});assert.equal(contact('61400000099').state,'待核查');
 sql.prepare("UPDATE crm_users SET active=1 WHERE id='bob'").run();
 // Concurrent deliveries for the same new peer share the deterministic lead and one assignment.
 const concurrentPeer='61400000004';await Promise.all([hook({messages:[incoming(concurrentPeer)]}),hook({messages:[incoming(concurrentPeer)]})]);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_leads WHERE phone=?').get(concurrentPeer).n,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments WHERE lead_id=?').get(lead(concurrentPeer).id).n,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_notes WHERE lead_id=?').get(lead(concurrentPeer).id).n,2);
 // Ownership transfer gates access immediately; company history follows the customer.
 sql.prepare("UPDATE crm_leads SET owner_id='bob' WHERE id=?").run(firstLead.id);
 await assert.rejects(call('messages?lead_id='+firstLead.id,undefined,alice),e=>e.status===404);
 assert.equal((await call('messages?lead_id='+firstLead.id,undefined,bob)).messages.length,2);
 assert.equal(JSON.parse(sql.prepare("SELECT payload FROM crm_allocation_configs WHERE scope='all'").get().payload).rule.automatic,false);
 assert.equal(count('crm_service_replies'),0);
 assert.ok(!providerCalls.some(url=>url.includes('smb_app_data')||url.endsWith('/messages')));
 await assert.rejects(call('send',{lead_id:firstLead.id,request_id:'company-not-authorized',text:'Do not send'}),e=>e.status===403);
 await call('disconnect',{});const stopped=count('crm_leads');await hook({messages:[incoming('61400000007')]});assert.equal(count('crm_leads'),stopped);
 console.log('PASS company Cloud API: admin authorization, signed real webhook flow, global phone dedup, original owner/source preservation, equal allocation, duplicate/concurrent delivery, pending recovery/backlog, conflict isolation, notifications, history suppression, ownership access, no automatic sending and no global allocation activation.');
}finally{globalThis.fetch=realFetch;sql.close();}
