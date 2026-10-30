import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {database,moduleURL} from './test-form-intake.mjs';
const {customerServiceEndpoint:service,receiveServiceMessage,serviceWorker}=await import(moduleURL('lib/customer-service.ts'));
const {linkedEndpoint,linkedWorker}=await import(moduleURL('lib/linked-whatsapp.ts'));
const {distributeServiceLead}=await import(moduleURL('lib/service-allocation.ts'));
const {digest}=await import(moduleURL('lib/crm.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),admin={id:'admin',role:'admin'},other={id:'other',role:'admin'},sales={id:'a',role:'sales'};
for(const u of [admin,other,...'abcdef'.split('').map(id=>({id,role:'sales'}))])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-10-30');
const config={members:'abcdef'.split('').map(user_id=>({user_id,state:'参与',share:100/6})),rule:{automatic:false}};
sql.prepare('INSERT INTO crm_allocation_configs VALUES(?,?,?,?)').run('all',JSON.stringify(config),'now','admin');
const call=(path,body,user=admin,actor=user)=>service(db,user,actor,'service/'+path,body===undefined?'GET':'POST',body||{});
await assert.rejects(call('inbox',undefined,sales),e=>e.status===403);await assert.rejects(call('inbox',undefined,admin,other),e=>e.status===403);
await assert.rejects(call('settings',{enabled:true,reply:'Welcome'}),e=>e.status===409);
sql.prepare("INSERT INTO crm_linked_devices(owner_id,token_hash,seen,status) VALUES(?,?,?,'connected')").run(admin.id,await digest('x'.repeat(40)),Date.now());
await call('settings',{enabled:true,reply:'Welcome. Please share your project requirements.'});
const message=(peer,id=peer,extra={})=>({id,peer,direction:'in',content:'Need playground',created:new Date().toISOString(),...extra});
await receiveServiceMessage(db,'admin',message('61400000000','history',{history:true}));assert.equal((await call('inbox')).contacts.length,0);
await receiveServiceMessage(db,'admin',message('61400000000','out',{direction:'out'}));assert.equal((await call('inbox')).contacts.length,0);
await receiveServiceMessage(db,'admin',message('61400000000'));await receiveServiceMessage(db,'admin',message('61400000000'));
assert.equal((await call('inbox')).contacts.length,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_service_replies').get().n,1);
const command=await serviceWorker(db,'admin',{},true);assert.ok(command);assert.equal(await serviceWorker(db,'admin',{},true),null);
await serviceWorker(db,'admin',{result:{id:command.id,state:'uncertain'}},true);assert.equal(await serviceWorker(db,'admin',{},true),null);
await assert.rejects(linkedEndpoint(db,admin,admin,'linked/send','POST',{}),e=>e.status===403);
const register=async(peer,category='全案',email='')=>{await receiveServiceMessage(db,'admin',message(peer));const row=(await call('inbox')).contacts.find(c=>c.peer===peer);return call('register',{id:row.id,version:row.version,name:'Customer '+peer,category,email,country:'AU',requirement:'Indoor playground'});};
const first=await register('61400000000');assert.equal(first.state,'已分配');assert.equal(first.owner_name,'a');
const firstRow=(await call('inbox')).contacts[0];await call('register',{id:firstRow.id,version:1});assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n,1);
for(let i=1;i<6;i++)await register('6140000000'+i);
assert.deepEqual(sql.prepare('SELECT owner_id,COUNT(*) n FROM crm_assignments GROUP BY owner_id ORDER BY owner_id').all().map(r=>r.n),[1,1,1,1,1,1]);
await register('61400000006','玩具');await register('61400000007','玩具');
assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_leads WHERE source='WhatsApp'").get().n,8);
assert.equal(JSON.parse(sql.prepare("SELECT payload FROM crm_allocation_configs WHERE scope='all'").get().payload).rule.automatic,false);
// Counts carry across month boundaries, prioritizing full-project balance, then cumulative totals.
sql.prepare("UPDATE crm_assignments SET allocation_month='2026-09'").run();const ninth=await register('61400000008');assert.equal(ninth.owner_name,'c');
// Existing customer keeps original source and owner; no new lead or assignment.
sql.prepare("INSERT INTO crm_leads(id,name,source,phone,email,owner_id,detail,fingerprint,created) VALUES('old','Old','Meta','61400000099','old@test.com','f','{}','old','2020-01-01')").run();
const before=sql.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n;
const repeat=await register('61400000099');assert.equal(repeat.state,'已有客户');assert.equal(repeat.owner_name,'f');assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n,before);
assert.equal(sql.prepare("SELECT source FROM crm_leads WHERE id='old'").get().source,'Meta');
assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_service_replies WHERE peer='61400000099'").get().n,0);
const emailRepeat=await register('61400000098','全案','OLD@TEST.COM');assert.equal(emailRepeat.lead_id,'old');
// Email/phone conflict never changes either owner.
sql.prepare("INSERT INTO crm_leads(id,name,source,phone,email,owner_id,detail,fingerprint,created) VALUES('conflict','Conflict','Meta','61400000097','conflict@test.com','e','{}','conflict','2020-01-01')").run();
await assert.rejects(register('61400000097','全案','old@test.com'),e=>e.status===409);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n,before);
// Revoking auto replies cancels queued messages and does not retry uncertain messages.
await receiveServiceMessage(db,'admin',message('61400000096'));await call('settings',{enabled:false,reply:'Welcome'});await serviceWorker(db,'admin',{},true);assert.equal(sql.prepare("SELECT state FROM crm_service_replies WHERE peer='61400000096'").get().state,'failed');
// No roster: intake survives, then retry assigns exactly once.
config.members.forEach(m=>m.state='暂停');sql.prepare("UPDATE crm_allocation_configs SET payload=? WHERE scope='all'").run(JSON.stringify(config));
await assert.rejects(register('61400000095'),e=>e.status===409);let pending=(await call('inbox')).contacts.find(c=>c.peer==='61400000095');assert.equal(pending.state,'待分配');
config.members.forEach(m=>m.state='参与');sql.prepare("UPDATE crm_allocation_configs SET payload=? WHERE scope='all'").run(JSON.stringify(config));await register('61400000095');await register('61400000095');assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments WHERE lead_id=?').get(pending.lead_id).n,1);
// The real worker routes admin incoming messages to this inbox; sales routes remain isolated.
const worker=body=>linkedWorker(db,new Request('https://crm.test/api/linked/worker',{headers:{authorization:'Bearer '+'x'.repeat(40)}}),body);
await worker({state:'connected',phone:'61411111111',messages:[message('61400000094')]});assert.ok((await call('inbox')).contacts.some(c=>c.peer==='61400000094'));assert.equal((await call('inbox',undefined,other)).contacts.length,0);
const notesBefore=sql.prepare('SELECT COUNT(*) n FROM crm_notes').get().n;await worker({messages:[message('61400000000','post-handoff')]});await worker({messages:[message('61400000000','post-handoff')]});assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_notes').get().n,notesBefore+1);
await call('settings',{enabled:true,reply:'Welcome'});const delivered=await worker({messages:[message('61400000093')]});assert.equal(delivered.command,null);const polled=await worker({state:'connected'});assert.equal(polled.command.peer,'61400000093');await worker({result:{id:polled.command.id,state:'sent',message_id:'reply93',peer:'61400000093'}});assert.equal(sql.prepare("SELECT state FROM crm_service_replies WHERE peer='61400000093'").get().state,'sent');
console.log('PASS service: role isolation, connection gate, historical suppression, reply idempotency, uncertain outcomes, existing owner/source preservation, email dedup, conflicts, full-first balance, cross-month counts, no global activation, retry and real worker routing.');

const ceo={id:'ceo',role:'ceo'};
const ceoInbox=await call('inbox',undefined,ceo);
assert.equal(ceoInbox.contacts.length,(await call('inbox')).contacts.length);
const ceoContact=ceoInbox.contacts[0];
assert.ok(Array.isArray((await call('conversation',{id:ceoContact.id},ceo)).messages));
const beforeCeo=sql.prepare('SELECT total_changes() n').get().n;
await assert.rejects(call('settings',{enabled:false,reply:''},ceo),e=>e.status===403);
await assert.rejects(call('register',{id:ceoContact.id},ceo),e=>e.status===403);
assert.equal(sql.prepare('SELECT total_changes() n').get().n,beforeCeo);
console.log('PASS: CEO reads company service records and conversations but cannot modify settings or register customers in management view.');
