process.on('uncaughtException',e=>{console.error(e.message);process.exitCode=1;});
import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';import {moduleURL,database} from './test-form-intake.mjs';
const {confirmedWorkflow}=await import(moduleURL('lib/confirmed-workflow.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));const db=database(sql);
const users=Object.fromEntries(['sales','other','followup','ceo','admin'].map(role=>[role,{id:role,role:role==='other'?'sales':role}]));for(const u of Object.values(users))sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-10-01');
for(const owner of ['sales','other'])sql.prepare("INSERT INTO crm_leads(id,name,source,business_scope,owner_id,entered,detail,fingerprint,created) VALUES(?,?,'Meta','meta-full',?,'2026-10-01','{}',?,'2026-10-01')").run(owner,owner,owner,owner);
sql.exec("INSERT INTO crm_sales_account_links(user_id,quote_email,updated,updated_by) VALUES('sales','sales@test.invalid','now','admin'),('other','other@test.invalid','now','admin')");
const qs=new DatabaseSync(':memory:');qs.exec(`CREATE TABLE app_users(email TEXT PRIMARY KEY,status TEXT);INSERT INTO app_users VALUES('sales@test.invalid','active'),('other@test.invalid','active');CREATE TABLE quotation_history(id TEXT PRIMARY KEY,contract_no TEXT,project_name TEXT,created_by TEXT,generated_at TEXT,lineage_id TEXT,is_finalized INTEGER,archived_at TEXT,final_amount REAL,final_currency TEXT,confirmed_at TEXT,voided_at TEXT,project_status TEXT,customer_name TEXT,quote_valid_until TEXT,snapshot_json TEXT);CREATE TABLE quotation_crm_messages(id TEXT PRIMARY KEY,quotation_id TEXT,kind TEXT,author TEXT,created_at TEXT);CREATE TABLE quotation_handovers(id TEXT,quotation_id TEXT,data_json TEXT,created_at TEXT);`);
qs.prepare("INSERT INTO quotation_history VALUES('q','Q-001','采购项目','sales@test.invalid','2026-10-30','family',1,NULL,100,'USD','2026-10-30',NULL,'won','客户','','{}')").run();
const source={prepare(q){assert.match(q,/^SELECT/,'Quote source must remain read-only');return database(qs).prepare(q);}};
const call=(path,body={},u=users.sales,method='POST')=>confirmedWorkflow(db,source,u,u,'confirmations/'+path,method,body,new URL('https://test.invalid/api/confirmations/'+path));
await assert.rejects(call('quote',{quote_id:'q',lead_id:'sales'}),/尚未经/);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_sales_projects').get().n,0);
qs.exec("INSERT INTO quotation_crm_messages VALUES('ready','q','业务员确认报价','sales@test.invalid','2026-10-30')");
assert.equal((await call('quotes',{},users.sales,'GET')).rows.length,1);await assert.rejects(call('quote',{quote_id:'q',lead_id:'other'}),/本人/);
const accepted=await call('quote',{quote_id:'q',lead_id:'sales'});assert.equal((await call('quote',{quote_id:'q',lead_id:'sales'})).id,accepted.id);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_sales_projects').get().n,1);
const p=sql.prepare('SELECT * FROM crm_sales_projects').get();
await assert.rejects(call('contract',{project_id:p.project_id,version:p.version,quote_id:'q',logistics_id:'followup',reason:'合同已签署'}),/交接/);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_followup_orders').get().n,0);
qs.prepare('INSERT INTO quotation_handovers VALUES(?,?,?,?)').run('handover','q',JSON.stringify({confirmedAt:'2026-10-30',finalAmount:100,currency:'USD',quotationId:'q',contractNo:'Q-001',paymentTerms:'发货前付清',customerConfirmation:'已签署',items:[{name:'设备',quantity:1}],files:[]}),'2026-10-30');
const body={project_id:p.project_id,version:p.version,quote_id:'q',logistics_id:'followup',reason:'合同已签署'};await assert.rejects(call('contract',body,users.other),/所属/);
const order=(await call('contract',body)).id;assert.equal((await call('contract',body)).id,order);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_followup_orders').get().n,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_deals').get().n,1);assert.equal(sql.prepare('SELECT total_minor FROM crm_workflow_contracts').get().total_minor,10000);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_receipts').get().n,0);
await assert.rejects(call('release',{order_id:order,kind:'payment',reason:'已收款',request_id:'pay1'}),/单据/);
await call('release',{order_id:order,kind:'special',reason:'允许账期',request_id:'special1'});
await assert.rejects(call('release/decision',{id:'special1',state:'approved',reason:'批准'},users.sales),/CEO/);
const ship=()=>sql.prepare("UPDATE crm_followup_orders SET details=json_set(details,'$.dates.actual_ship.date','2026-11-03') WHERE id=?").run(order);
assert.throws(ship,/CEO/);await call('release/decision',{id:'special1',state:'approved',reason:'批准账期'},users.ceo);ship();
const {executionEndpoint}=await import(moduleURL('lib/order-execution-server.ts'));const row=sql.prepare('SELECT * FROM crm_followup_orders').get();
await executionEndpoint(db,source,users.followup,users.followup,'followup/orders/'+order+'/execution/source','POST',{version:row.version,amendment:{payment_terms:'付款条款修订'},reason:'核对合同修订'},new URL('https://test.invalid'));
const changed=sql.prepare('SELECT * FROM crm_followup_orders').get();assert.equal(changed.commercial_revision,1);assert.equal(JSON.parse(changed.details).original_contract_source.payment_terms,'发货前付清');
assert.throws(()=>sql.prepare("UPDATE crm_followup_orders SET details=json_set(details,'$.dates.actual_ship.date','2026-11-04') WHERE id=?").run(order),/CEO/);
assert(sql.prepare("SELECT COUNT(*) n FROM crm_followup_events WHERE kind='修改订单商务资料'").get().n===1);assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
assert.equal(sql.prepare("SELECT cohort FROM crm_leads WHERE id='sales'").get().cohort,'historical');
console.log('PASS: explicit quote acceptance, source permissions, no duplicate projects/orders/deals, contract handover requirements, salesperson ownership, CEO-only special approval, audited follower amendments, preserved source, stale release rejection and historical first deal.');

// Immediate inbox notifications survive scheduled reminders; ordinary users cannot approve.
const {refreshFollowupNotifications}=await import(moduleURL('lib/followup-notifications.ts'));
await refreshFollowupNotifications(db);assert(sql.prepare("SELECT COUNT(*) n FROM crm_followup_notifications WHERE recipient_id='followup' AND dedupe_key LIKE 'confirmation:%' AND resolved_at=''").get().n>=2);
assert.equal((await call('releases',{},users.other,'GET')).rows.length,0);
assert.equal((await call('releases',{},users.followup,'GET')).rows.length,1);
// Payment proof is mandatory and retry identifiers cannot be reused for different instructions.
sql.prepare("INSERT INTO crm_followup_files(id,order_id,step,name,object_key,size,created,created_by,document_kind) VALUES('proof',?,0,'付款.pdf','fixture-proof',5,'2026-10-30','sales','付款单据')").run(order);
await call('release',{order_id:order,kind:'payment',reason:'已核对付款凭证',file_id:'proof',request_id:'payment2'});
await assert.rejects(call('release',{order_id:order,kind:'payment',reason:'不同指示',file_id:'proof',request_id:'payment2'}),/冲突/);
// Source files are copied once into the CRM archive, with checksums and no quote-bucket writes.
qs.exec("CREATE TABLE trade_documents(id TEXT,owner TEXT,kind TEXT,data_json TEXT,pdf_key TEXT,pdf_hash TEXT,filename TEXT,created_at TEXT)");
const bytes=new TextEncoder().encode('%PDF- test contract'),hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
qs.prepare('INSERT INTO trade_documents VALUES(?,?,?,?,?,?,?,?)').run('pi','sales@test.invalid','PI','{"sourceQuotationId":"q"}','source-pi',hash,'PI.pdf','2026-10-30');
const objects=new Map(),stores={source:{get:async key=>key==='source-pi'?{arrayBuffer:async()=>bytes.buffer}:null},destination:{put:async(key,data)=>objects.set(key,data),delete:async key=>objects.delete(key)}};
const docs=()=>confirmedWorkflow(db,source,users.sales,users.sales,'confirmations/documents','POST',{order_id:order},new URL('https://test.invalid'),stores);
await assert.rejects(call('documents',{order_id:order},users.followup),/本单销售/);
assert.equal((await docs()).copied,1);assert.equal((await docs()).copied,0);assert.equal(objects.size,1);assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_followup_files WHERE document_kind='PI'").get().n,1);
qs.prepare('INSERT INTO trade_documents VALUES(?,?,?,?,?,?,?,?)').run('bad','sales@test.invalid','CI','{"sourceQuotationId":"q"}','source-pi','bad-hash','CI.pdf','2026-10-30');
await assert.rejects(docs(),/校验失败/);assert.equal(objects.size,1);
console.log('PASS: payment proof, CEO/follower inbox, scheduled notice retention, release idempotence, archive copying/deduplication/checksums and permission isolation.');

// A superseded payment document cannot authorize a new release; stale editors cannot overwrite.
const {writeFollowup}=await import(moduleURL('lib/order-followup-server.ts'));
const priorOrder=sql.prepare('SELECT * FROM crm_followup_orders WHERE id=?').get(order);
const hydrated={...priorOrder,details:JSON.parse(priorOrder.details),steps:JSON.parse(priorOrder.steps)};
await writeFollowup(db,hydrated,{version:hydrated.version},users.sales,'上传附件',{previous_id:'proof'},()=>[db.prepare("INSERT INTO crm_followup_files(id,order_id,step,name,object_key,size,created,created_by,document_kind,previous_id) VALUES('proof-v2',?,0,'revised.pdf','fixture-v2',5,'2026-10-30','sales','付款单据','proof')").bind(order)],undefined,true);
assert.equal(sql.prepare('SELECT commercial_revision FROM crm_followup_orders WHERE id=?').get(order).commercial_revision,hydrated.commercial_revision+1);
await assert.rejects(call('release',{order_id:order,kind:'payment',reason:'旧凭证不可复用',file_id:'proof',request_id:'payment-old'}),/单据/);
await assert.rejects(executionEndpoint(db,source,users.followup,users.followup,'followup/orders/'+order+'/execution/source','POST',{version:priorOrder.version,amendment:{payment_terms:'过时编辑'},reason:'旧页面'},new URL('https://test.invalid')),e=>e.status===409);
await call('release',{order_id:order,kind:'payment',reason:'核对新版本付款单据',file_id:'proof-v2',request_id:'payment-current'});
assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_followup_files WHERE id IN ('proof','proof-v2')").get().n,2);
console.log('PASS: superseded evidence retained but rejected, release revision invalidation, stale editor rejection and reconfirmation with latest evidence.');
