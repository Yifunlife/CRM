import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const module=(file,replacements={})=>{let source=readFileSync(file,'utf8');for(const [from,to] of Object.entries(replacements))source=source.replaceAll(from,JSON.stringify(to));return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');};
const crm=module('lib/crm.ts'),allocation=module('lib/allocation.ts'),server=module('lib/allocation-server.ts',{"'./crm'":crm,"'./allocation'":allocation});
const {customerPoolEndpoint,processCustomerPool}=await import(module('lib/customer-pool.ts',{"'./crm'":crm,"'./allocation'":allocation,"'./allocation-server'":server,"'./attribution'":module('lib/attribution.ts'),"'./lead-notifications'":module('lib/lead-notifications.ts',{"'./crm'":crm}),"'./customer-progress'":module('lib/customer-progress.ts',{"'./crm'":crm})}));
const {allocationWeights,distribute}=await import(server);
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}async run(){return {meta:sqlite.prepare(this.sql).run(...this.args)};}}
const db={prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const out=statements.map(s=>({meta:sqlite.prepare(s.sql).run(...s.args)}));sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const admin={id:'admin',role:'admin'},sales={id:'a',role:'sales'},other={id:'b',role:'sales'},ops={id:'ops',role:'operations'};
for(const u of [admin,sales,other,ops,{id:'paused',role:'sales'},{id:'off',role:'sales'}])sqlite.prepare('INSERT INTO crm_users(id,username,name,role,password,created,active) VALUES(?,?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-01-01',u.id==='off'?0:1);
const members=[{user_id:'a',state:'参与',share:99},{user_id:'b',state:'参与',share:1},{user_id:'paused',state:'暂停',share:0},{user_id:'off',state:'参与',share:0}];
const config={members,rule:{automatic:true,performance:30,maxChange:10,minimum:5,receipts:true}};
function configure(value=config){sqlite.prepare('INSERT INTO crm_allocation_configs(scope,payload,updated,updated_by) VALUES(?,?,?,?) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload').run('all',JSON.stringify(value),'now','admin');}
const call=(path,body={},user=admin,method='POST')=>customerPoolEndpoint(db,user,user,'customer-pool'+path,method,body);
const report=(user=admin)=>call('',{},user,'GET');
const pool=id=>sqlite.prepare('SELECT * FROM crm_customer_pool WHERE id=?').get(id);
const lead=id=>sqlite.prepare('SELECT * FROM crm_leads WHERE id=?').get(id);
const values=(n)=>({name:'客户'+n,phone:'8613800'+String(n).padStart(6,'0'),email:'',country:'',business_scope:'whatsapp',requirement:'室内游乐场',summary:''});
async function submit(n,user=sales){const id='intake-'+String(n).padStart(16,'0');await call('/submit',{id,source:'WhatsApp／其他',raw:'原始消息'+n},user);return id;}
const confirm=(id,data,target='',reason='')=>call('/confirm',{id,version:pool(id).version,fields:data,target_lead_id:target,reason});
const one=await submit(1);
assert.equal(lead(one),undefined,'raw input must not create a lead');
await call('/submit',{id:one,source:'WhatsApp／其他',raw:'原始消息1'},sales);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_customer_pool').get().n,1);
await assert.rejects(call('/submit',{id:one,source:'WhatsApp／其他',raw:'different'},sales),/编号已使用/);
await assert.rejects(confirm(one,{name:'unknown'}),/联系方式/);
await assert.rejects(confirm(one,{...values(1),email:'not-an-email'}),/邮箱/);
await assert.rejects(call('/confirm',{id:one,version:0,fields:values(1)},sales),/权限/);
await confirm(one,values(1));
assert.equal(pool(one).state,'待分配');assert.equal(lead(one).owner_id,null);
assert.equal((await report(other)).rows.length,0,'other salesperson cannot see unassigned submissions');
configure();await processCustomerPool(db);
assert.equal(pool(one).state,'已入CRM');assert.equal(lead(one).owner_id,'a');assert.equal(JSON.parse(lead(one).detail)['项目需求描述'],'室内游乐场');
assert.equal((await report(sales)).rows[0].can_open,true);
await processCustomerPool(db);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n,1);
const two=await submit(2);await confirm(two,values(2));assert.equal(lead(two).owner_id,'b');
assert.equal((await report(sales)).rows.find(r=>r.id===two),undefined,'submitter cannot read forms assigned to someone else');
const broadSales={...sales,permissions:{customers_all:true,leads_allocate:true,advertising_view:true}};
const broadReport=await report(broadSales);
assert.equal(broadReport.manages,false);
assert.ok(broadReport.rows.every(r=>r.owner_id===sales.id||(!r.owner_id&&r.created_by===sales.id)));
assert.equal(broadReport.rows.find(r=>r.id===two),undefined);
assert.deepEqual(broadReport.campaigns,[]);
const saved=sqlite.prepare('SELECT id,owner_id,status,grade FROM crm_leads ORDER BY id').all();
// Contact matches must be explicitly reviewed; old customer does not consume an allocation slot.
const repeat=await submit(3);await assert.rejects(confirm(repeat,values(1)),/相同联系方式/);
const review=await call('/review',{id:repeat,fields:values(1)});assert.equal(review.candidates[0].id,one);
await confirm(repeat,values(1),one,'客户原号码再次咨询');assert.equal(pool(repeat).lead_id,one);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_notes WHERE lead_id=?').get(one).n,1);
assert.deepEqual(sqlite.prepare('SELECT id,owner_id,status,grade FROM crm_leads ORDER BY id').all(),saved);
await processCustomerPool(db);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_notes').get().n,1);
assert.equal((await report(sales)).rows.find(r=>r.id===repeat).followed,false);
sqlite.prepare('UPDATE crm_leads SET last_contact=? WHERE id=?').run(new Date(Date.now()+1000).toISOString(),one);
assert.equal((await report(sales)).rows.find(r=>r.id===repeat).followed,true);
// Two simultaneous confirmations cannot produce two new customers for the same contact.
const same1=await submit(4),same2=await submit(5);
await Promise.allSettled([confirm(same1,values(4)),confirm(same2,values(4))]);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_leads WHERE phone=?').get(values(4).phone).n,1);
assert.ok([pool(same1).state,pool(same2).state].includes('待确认'));
// Concurrent processors and an injected post-create interruption must remain resumable and idempotent.
const retry=await submit(6);configure({...config,rule:{...config.rule,automatic:false}});await confirm(retry,values(6));
assert.equal(pool(retry).state,'待分配');assert.equal(lead(retry).owner_id,null);
configure();await Promise.all([processCustomerPool(db),processCustomerPool(db)]);
assert.equal(pool(retry).state,'已入CRM');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_assignments WHERE lead_id=?').get(retry).n,1);
// Leave/disabled accounts and historical performance never affect the equal pool.
assert.deepEqual((await allocationWeights(db,'whatsapp')).weights.map(r=>[r.user_id,r.share]),[['a',50],['b',50]]);
configure({...config,members:members.map(m=>m.user_id==='a'?{...m,state:'请假'}:m)});
const leave=await submit(7);await confirm(leave,values(7));assert.equal(lead(leave).owner_id,'b');
configure({...config,members:members.map(m=>({...m,state:'暂停'}))});const noStaff=await submit(8);await confirm(noStaff,values(8));assert.equal(pool(noStaff).state,'待分配');
configure();await processCustomerPool(db);assert.equal(pool(noStaff).state,'已入CRM');
const count=sqlite.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n;
await distribute(db,[one,two],'whatsapp','admin');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n,count);
// Historical waiting leads are not swept by the worker.
sqlite.prepare("INSERT INTO crm_leads(id,name,source,business_scope,detail,fingerprint,created) VALUES('history','old','WhatsApp／其他','whatsapp','{}','history','2020-01-01')").run();
await processCustomerPool(db);assert.equal(lead('history').owner_id,null);
// Fresh confirmations are rejected if the reviewer no longer has permission.
const revoked=await submit(9);configure({...config,rule:{...config.rule,automatic:false}});await confirm(revoked,values(9));
sqlite.prepare("UPDATE crm_users SET active=0 WHERE id='admin'").run();configure();await processCustomerPool(db);assert.equal(lead(revoked).owner_id,null);
sqlite.prepare("UPDATE crm_users SET active=1 WHERE id='admin'").run();await processCustomerPool(db);assert.ok(lead(revoked).owner_id);
const today=(await report()).today;
sqlite.prepare("UPDATE crm_leads SET next_date=?,status='正在沟通' WHERE id=?").run(today,one);
assert.ok((await report(sales)).todo.some(l=>l.id===one));assert.ok(!(await report(other)).todo.some(l=>l.id===one));
assert.ok((await report()).assigned.reduce((n,r)=>n+r.count,0)>0);
await assert.rejects(call('/review',{id:one,fields:values(1)},sales),/权限/);
assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
console.log('PASS: raw intake, incomplete data, identity review, old-customer append, permissions, duplicate submissions, concurrent confirm/process, resumable allocation, leave/disabled users, historical lead preservation, follow-up visibility, summary and audit.');

// Contact channel and advertising source can differ. Source approval is queued once.
sqlite.exec("INSERT INTO crm_operation_accounts(id,name,platform,currency,owner_id,created,created_by,updated,updated_by) VALUES('ad-account','test','Facebook','USD','ops','now','admin','now','admin'); INSERT INTO crm_attribution_campaigns(id,code,name,platform,account_id,created,created_by) VALUES('ad-campaign','AD-TEST','test','Meta','ad-account','now','admin');");
configure();const advertised=await submit(501),advertisedFields={...values(501),source_kind:'广告活动',campaign_id:'ad-campaign',attribution_reason:'核实平台线索编号'};
await assert.rejects(confirm(advertised,{...advertisedFields,campaign_id:'missing'}),/有效的广告/);
await assert.rejects(confirm(advertised,{...advertisedFields,attribution_reason:''}),/核查依据/);
await confirm(advertised,advertisedFields);await processCustomerPool(db);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_attribution_requests WHERE entity_id=?').get(advertised).n,1);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_attribution_leads WHERE lead_id=?').get(advertised).n,0,'Source waits for existing admin approval');
const advertisedRepeat=await submit(502);await confirm(advertisedRepeat,advertisedFields,advertised,'已核实为同一客户');
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_attribution_requests WHERE entity_id=?').get(advertised).n,1,'Repeat enquiry must not overwrite acquisition source');
console.log('PASS: intake advertising evidence, required campaign/reason, idempotent pending approval and original-customer source preservation.');
