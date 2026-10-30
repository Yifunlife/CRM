import {moduleURL} from './test-form-intake.mjs';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const module=(file,replacements={})=>{let s=readFileSync(file,'utf8');for(const [a,b]of Object.entries(replacements))s=s.replaceAll(a,JSON.stringify(b));return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');};
const crm=module('lib/crm.ts'),pure=module('lib/sales-suite.ts'),role=module('lib/role-workspace.ts'),orders=module('lib/order-followup.ts');
const err='data:text/javascript,export class AllocationError extends Error{constructor(message,status=400){super(message);this.status=status;}}';
const followup=module('lib/order-followup-server.ts',{"'./crm'":crm,"'./allocation-server'":err,"'./order-followup'":orders,"'./order-import-server'":'data:text/javascript,export const importOrders=()=>{throw Error("not used")};'});
const quote=module('lib/sales-quote-source.ts',{"'./crm'":crm,"'./sales-suite'":pure,"'./allocation-server'":err});
const {roleWorkspaceEndpoint:call}=await import(moduleURL('lib/role-workspace-server.ts'));
const {deliveryStage,DELIVERY_STAGES}=await import(role);
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
function stmt(sql,args=[]){return {bind:(...v)=>stmt(sql,v),async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return {meta:sqlite.prepare(sql).run(...args)}}};}
const db={prepare:sql=>stmt(sql),async batch(ss){sqlite.exec('BEGIN');try{const out=[];for(const s of ss)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const admin={id:'admin',role:'admin'},sales={id:'sales',role:'sales',permissions:{customers_all:true}},other={id:'other',role:'sales'},follow={id:'follow',role:'followup'},ceo={id:'ceo',role:'ceo'};
for(const u of [admin,sales,other,follow,ceo])sqlite.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-10-01');
const original={原需求:'必须保留',_sales_progress:{stage:'design'},附件:'原位置'};
for(const [id,owner,grade] of [['lead','sales','A'],['foreign','other','B']])sqlite.prepare("INSERT INTO crm_leads(id,name,source,owner_id,grade,detail,fingerprint,created) VALUES(?,?,'Meta',?,?,?,?,?)").run(id,id,owner,grade,JSON.stringify(original),id,'2026-10-01');
for(const [id,lead,owner,currency,total]of [['deal','lead','sales','CNY',1000000],['usd','foreign','other','USD',200000],['missing','lead','sales',null,null]]){sqlite.prepare("INSERT INTO crm_deals(id,order_number,lead_id,owner_id,business_scope,deal_date,created,created_by) VALUES(?,?,?,?, 'meta-full','2026-10-20','2026-10-20','admin')").run(id,id,lead,owner);if(currency)sqlite.prepare("INSERT INTO crm_workflow_contracts(deal_id,currency,total_minor,schedule,updated,updated_by) VALUES(?,?,?,'[]','2026-10-20','admin')").run(id,currency,total);}
sqlite.prepare("INSERT INTO crm_sales_projects(project_id,lead_id,name,stage,stage_at,amount_minor,currency,expected_date,details,token,created,created_by,updated,updated_by) VALUES('p','lead','项目','won','2026-10-01',1000000,'CNY','2026-10-20',?,'x','2026-10-01','admin','2026-10-01','admin')").run(JSON.stringify({deal_id:'deal'}));
sqlite.prepare("INSERT INTO crm_sales_quote_links(id,project_id,quote_id,source_key,summary,synced,created,created_by,updated,updated_by) VALUES('q','p','q1','family',?,'2026-10-01','2026-10-01','admin','2026-10-01','admin')").run(JSON.stringify({available:true,bridge_shared:true,currency:'CNY',amount_minor:1000000}));
const oldDetails={dates:{planned_ship:{date:'2026-11-15'}},legacy:'保留旧字段',contract_source:{contract_no:'HT-OLD'}},steps=Array.from({length:12},()=>({status:'待处理',checks:[]}));
for(const [id,lead,owner]of [['order','lead','sales'],['foreign-order','foreign','other']])sqlite.prepare("INSERT INTO crm_followup_orders(id,order_number,project,lead_id,deal_id,commercial_id,logistics_id,details,steps,change_token,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,?,?,?,?,'old','2026-10-01','admin','2026-10-01','admin')").run(id,id,id,lead,id==='order'?'deal':'usd',owner,'follow',JSON.stringify(oldDetails),JSON.stringify(steps));
sqlite.exec("INSERT INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES('old-note','lead','sales','历史跟进','邮件','旧下一步','2026-10-01')");
sqlite.exec("UPDATE crm_leads SET country=CASE id WHEN 'lead' THEN '中国' ELSE '美国' END");
const get=(u=sales,month='2026-10',market='内贸')=>call(db,u,u,'role-workspace/report','GET',{},new URL('http://test/?month='+month+'&market='+encodeURIComponent(market)));
const snapshot=()=>JSON.stringify({leads:sqlite.prepare('SELECT * FROM crm_leads ORDER BY id').all(),notes:sqlite.prepare('SELECT * FROM crm_notes').all(),orders:sqlite.prepare('SELECT * FROM crm_followup_orders ORDER BY id').all()});
const before=snapshot();const personal=await get();assert.equal(personal.summary.customers,1);assert.equal(personal.orders.length,1);assert.equal(personal.people.length,1);assert.equal(personal.summary.projects,1,'linked sales project and order are one project');assert.deepEqual(personal.summary.won,{CNY:1000000});assert.equal(personal.summary.unpriced,1);assert.equal(personal.summary.quote_count,1);assert.equal(personal.deals.length,2);
const company=await get(ceo);assert.deepEqual(company.summary.won,{CNY:1000000});assert.equal(company.orders.length,1);const foreignReport=await get(ceo,'2026-10','外贸');assert.deepEqual(foreignReport.summary.won,{USD:200000});assert.equal(foreignReport.orders.length,1);assert.equal(foreignReport.summary.customers,1);assert.equal(company.currency,'CNY');assert.equal(foreignReport.currency,'USD');assert.equal(snapshot(),before,'report never changes original data');assert.equal((await get(sales,'2026-09')).deals.length,0);await assert.rejects(()=>get(follow),/权限/);await assert.rejects(()=>get(sales,'2026-99'),/月份/);
sqlite.exec("UPDATE crm_workflow_contracts SET currency='CNY' WHERE deal_id='usd'");const mismatch=await get(ceo,'2026-10','外贸');assert.deepEqual(mismatch.summary.won,{});assert.equal(mismatch.summary.currency_mismatches,1);assert.equal(mismatch.deals[0].currency,'CNY','original currency remains in detail for verification');sqlite.exec("UPDATE crm_workflow_contracts SET currency='USD' WHERE deal_id='usd'");sqlite.exec("UPDATE crm_leads SET country='',source='独立站',business_scope='' WHERE id='foreign'");const unknown=await get(ceo,'2026-10','待确认');assert.equal(unknown.summary.customers,1);assert.equal(unknown.currency,'');assert.deepEqual(unknown.summary.won,{});sqlite.exec("UPDATE crm_leads SET country='美国',source='Meta' WHERE id='foreign'");
const post=(u,path,body)=>call(db,u,u,path,'POST',body,new URL('http://test'));
const profile={id:'lead',revision:0,country:'澳洲',method:'邮件',source_note:'展会后补充',contacts:[{name:'Alex',role:'采购',phone:'123',email:'x@example.test'}]};await assert.rejects(()=>post(other,'role-workspace/customer',profile),/无权/);await assert.rejects(()=>post(ceo,'role-workspace/customer',profile),/权限/);await post(sales,'role-workspace/customer',profile);const edited=sqlite.prepare("SELECT * FROM crm_leads WHERE id='lead'").get();const detail=JSON.parse(edited.detail);assert.equal(detail.原需求,original.原需求);assert.deepEqual(detail._sales_progress,original._sales_progress);assert.equal(detail.附件,original.附件);assert.equal(edited.source,'Meta');assert.equal(edited.owner_id,'sales');assert.equal(detail._contacts[0].name,'Alex');assert.equal(sqlite.prepare('SELECT content FROM crm_notes').get().content,'历史跟进');await assert.rejects(()=>post(sales,'role-workspace/customer',profile),/已变化/);
const processInput={page:'生产跟进',version:1,purchase_kind:'toy',business_stage:'玩具下单',values:{生产排期:'11月1日',工厂与负责人:'工厂甲',生产进度:'待生产',预计完工日期:'11月10日'},next:'跟单甲于11月2日确认进度'};
await assert.rejects(()=>post(sales,'followup/orders/order/business-process',processInput),/维护权限/);await post(follow,'followup/orders/order/business-process',processInput);const updated=sqlite.prepare("SELECT * FROM crm_followup_orders WHERE id='order'").get(),d=JSON.parse(updated.details);assert.equal(d.legacy,oldDetails.legacy);assert.deepEqual(d.dates,oldDetails.dates);assert.deepEqual(d.contract_source,oldDetails.contract_source);assert.equal(updated.steps,JSON.stringify(steps));assert.equal(d.business_process['生产跟进'].values.生产进度,'待生产');assert.equal(sqlite.prepare("SELECT count(*) n FROM crm_followup_events WHERE order_id='order'").get().n,1);await assert.rejects(()=>post(follow,'followup/orders/order/business-process',processInput),/已更新/);
assert.deepEqual(DELIVERY_STAGES.slice(0,3),['设计沟通中','项目下单','玩具下单']);assert.equal(deliveryStage({stage:0,details:{purchase_kind:'toy'}}),'玩具下单');assert.equal(deliveryStage({archived:1,details:{}}),'已完成');assert.equal(deliveryStage({details:{execution:{stages:{shipping:{status:'已完成'}}}}}),'待安装');
await assert.rejects(()=>get(ceo,'2026-10','全部'),/分类无效/);
console.log('Role workspace: personal isolation, CEO currencies, month scopes, project deduplication, original data preservation, profile conflicts, order history and stage order passed.');
// Workflow-cell completion must retain concurrency, pending-task and archive gates.
const latestVersion=()=>sqlite.prepare("SELECT version FROM crm_followup_orders WHERE id='order'").get().version;
const processBody=(extra={})=>({...processInput,version:latestVersion(),status:'进行中',owner_id:'follow',due:'2026-11-05',...extra});
await assert.rejects(()=>post(follow,'followup/orders/order/business-process',processBody({status:'随便'})),/状态/);
await assert.rejects(()=>post(follow,'followup/orders/order/business-process',processBody({owner_id:'not-a-user'})),/负责人/);
await assert.rejects(()=>post(follow,'followup/orders/order/business-process',processBody({due:'2026-02-30'})),/日期/);
await assert.rejects(()=>post(follow,'followup/orders/order/business-process',processBody({status:'已完成',values:{}})),/全部核对项/);
await assert.rejects(()=>post(follow,'followup/orders/order/business-process',processBody({page:'跟进收款',status:'已完成'})),/归档流程/);
await assert.rejects(()=>post(ceo,'followup/orders/order/business-process',processBody()),/维护权限/);
sqlite.exec("INSERT INTO crm_followup_tasks(id,order_id,kind,step,title,impact,contact_reply,next_action,owner_id,due_at,next_followup,created,created_by,updated,updated_by) VALUES('board-pending','order','异常',3,'待复验','未完成','待处理','复验','follow','2026-11-05','2026-11-05','now','admin','now','admin')");
await assert.rejects(()=>post(follow,'followup/orders/order/business-process',processBody({status:'已完成'})),/未解决待办/);
sqlite.exec("UPDATE crm_followup_tasks SET status='已解决' WHERE id='board-pending'");
const priorSteps=sqlite.prepare("SELECT steps FROM crm_followup_orders WHERE id='order'").get().steps;
await post(follow,'followup/orders/order/business-process',processBody({status:'已完成'}));
const doneOrder=sqlite.prepare("SELECT * FROM crm_followup_orders WHERE id='order'").get(),doneDetails=JSON.parse(doneOrder.details);
assert.equal(doneDetails.business_process['生产跟进'].status,'已完成');assert.equal(doneDetails.business_process['生产跟进'].owner_id,'follow');assert.equal(doneOrder.steps,priorSteps);assert.deepEqual(doneDetails.contract_source,oldDetails.contract_source);assert.equal(doneOrder.archived,0);
const {FOLLOWUP_NODES,processSummary}=await import(moduleURL('lib/followup-board.ts'));
assert.equal(processSummary({...doneOrder,details:doneDetails},FOLLOWUP_NODES[1],[]).status,'已完成');
assert.equal(processSummary({...doneOrder,details:doneDetails},FOLLOWUP_NODES[1],[{order_id:'order',step:3,status:'待处理'}]).status,'待确认');
assert.equal(processSummary({id:'x',details:{business_process:{单证制作:{next:'旧记录'}}}},FOLLOWUP_NODES[3]).status,'已记录');
assert.equal(processSummary({id:'x',archived:1,details:{}},FOLLOWUP_NODES[6]).status,'已完成');
// Performance uses effective receipts minus refunds, scoped to the original deal owner.
sqlite.exec("UPDATE crm_leads SET country='中国' WHERE id='lead'");
sqlite.exec("INSERT INTO crm_receipts(id,reference,deal_id,amount_minor,currency,received_date,created,created_by) VALUES('paid','paid','deal',600000,'CNY','2026-09-01','now','admin'),('cancelled-paid','cancelled-paid','deal',900000,'CNY','2026-10-20','now','admin'),('other-paid','other-paid','usd',10000,'USD','2026-10-20','now','admin')");
sqlite.exec("UPDATE crm_receipts SET cancelled=1 WHERE id='cancelled-paid'");
sqlite.exec("INSERT INTO crm_workflow_refunds(id,reference,receipt_id,amount_minor,refunded_date,reason,created,created_by) VALUES('refund','refund','paid',100000,'2026-10-21','核验','now','admin')");
const performance=await get(sales);const detailDeal=performance.deals.find(d=>d.id==='deal');assert.equal(detailDeal.received_minor,500000);assert.equal(detailDeal.outstanding_minor,500000);assert.ok(!performance.deals.some(d=>d.id==='usd'));
sqlite.exec("INSERT INTO crm_receipts(id,reference,deal_id,amount_minor,currency,received_date,created,created_by) VALUES('mixed','mixed','deal',100,'USD','2026-10-20','now','admin')");
const mixed=(await get(sales)).deals.find(d=>d.id==='deal');assert.equal(mixed.received_minor,null);assert.equal(mixed.outstanding_minor,null);assert.equal(mixed.receipt_currency_mismatch,true);
console.log('PASS: workflow-cell status, pending-task gate, archive gate, active owner, dates, legacy preservation, receipt refunds/cancellations/currency mismatch and sales isolation.');
const {PROCESS_FIELDS}=await import(role);
const flowArchive={...processBody({page:'跟进收款',archive:true,archive_checks:[0,1,2,3],values:Object.fromEntries(PROCESS_FIELDS['跟进收款'].map(k=>[k,'已核对：'+k]))})};
await assert.rejects(()=>post(follow,'followup/orders/order/business-process',flowArchive),/全部环节/);
const archiveDetails=JSON.parse(sqlite.prepare("SELECT details FROM crm_followup_orders WHERE id='order'").get().details);
for(const n of FOLLOWUP_NODES.slice(0,-1))archiveDetails.business_process[n.page]={status:'已完成',owner_id:'follow',next:'已核对并留存资料',values:Object.fromEntries(PROCESS_FIELDS[n.page].map(k=>[k,'已核对资料']))};
sqlite.prepare("UPDATE crm_followup_orders SET details=? WHERE id='order'").run(JSON.stringify(archiveDetails));
await assert.rejects(()=>post(follow,'followup/orders/order/business-process',flowArchive),/收款或币种/);
sqlite.exec("UPDATE crm_receipts SET cancelled=1 WHERE id='mixed'");
await assert.rejects(()=>post(follow,'followup/orders/order/business-process',flowArchive),/收款或币种/);
sqlite.exec("INSERT INTO crm_receipts(id,reference,deal_id,amount_minor,currency,received_date,created,created_by) VALUES('final-paid','final-paid','deal',500000,'CNY','2026-10-30','now','admin')");
await post(follow,'followup/orders/order/business-process',flowArchive);
const archived=sqlite.prepare("SELECT * FROM crm_followup_orders WHERE id='order'").get();assert.equal(archived.archived,1);assert.equal(archived.steps,priorSteps,'the new workflow does not invent historical legacy checklist answers');assert.equal(JSON.parse(archived.details).business_process['跟进收款'].status,'已完成');
await assert.rejects(()=>post(follow,'followup/orders/order/business-process',processBody()),/已归档/);
console.log('PASS: one-table archive checks all workflow cells and actual net receipts, rejects unsettled/mixed currency, retains legacy records, and makes archived orders read-only.');

if(process.env.ROLE_WORKSPACE_FIXTURE){
 const {randomBytes,createHash}=await import('node:crypto');const {writeFileSync}=await import('node:fs');const cookies={};
 for(const user of [admin,sales,other,follow,ceo]){const token=randomBytes(32).toString('hex');cookies[user.id]=token;sqlite.prepare('INSERT INTO crm_sessions(token,user_id,expires) VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),user.id,new Date(Date.now()+86400000).toISOString());}
 const quote=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
 const sql=['PRAGMA foreign_keys=OFF;'];for(const {name}of sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'crm_%'").all()){for(const row of sqlite.prepare('SELECT * FROM '+name).all()){sql.push('INSERT INTO '+name+' ('+Object.keys(row).map(k=>'"'+k+'"').join(',')+') VALUES ('+Object.values(row).map(quote).join(',')+');');}}
 sql.push('PRAGMA foreign_keys=ON;');writeFileSync(process.env.ROLE_WORKSPACE_FIXTURE,sql.join('\n'),{mode:0o600});writeFileSync(process.env.ROLE_WORKSPACE_FIXTURE+'.sessions.json',JSON.stringify(cookies),{mode:0o600});
}
