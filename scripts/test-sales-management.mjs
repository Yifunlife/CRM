import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {salesManagementEndpoint:call}=await import(moduleURL('lib/sales-management-server.ts'));
const {salesManagementReport:report}=await import(moduleURL('lib/sales-management.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),admin={id:'admin',role:'admin'},manager={id:'manager',role:'management'},ceo={id:'ceo',role:'ceo'},sales={id:'sales',role:'sales'};
for(const [id,role,scopes] of [['admin','admin',[]],['manager','management',[]],['ceo','ceo',[]],['sales','sales',['domestic']],['foreign','sales',['foreign']]])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,trade_scopes,created) VALUES(?,?,?,?,?,?,?)').run(id,id,id,role,'unused',JSON.stringify(scopes),'2026-01-01');
for(const [id,owner,date,country,grade] of [['old','sales','2025-01-01','中国','A'],['new','sales','2026-10-01','中国','A'],['foreign-lead','foreign','2026-10-02','美国','B']])sql.prepare("INSERT INTO crm_leads(id,name,source,owner_id,entered,country,grade,fingerprint,detail,created) VALUES(?,?,'Meta',?,?,?,?,?,'{}',?)").run(id,id,owner,date,country,grade,id,date);
for(const [id,lead,owner,date,currency,amount] of [['prior','old','sales','2025-05-01','CNY',9000],['repeat','old','sales','2026-10-01','CNY',20000],['first','new','sales','2026-10-03','CNY',30000],['second','new','sales','2026-10-10','CNY',5000],['usd','foreign-lead','foreign','2026-10-11','USD',10000],['unpriced','old','sales','2026-09-10',null,null],['boundary','old','sales','2027-01-01','CNY',7000]]){
 sql.prepare("INSERT INTO crm_deals(id,order_number,lead_id,owner_id,business_scope,deal_date,created,created_by) VALUES(?,?,?,?,'meta-full',?,?,'admin')").run(id,id,lead,owner,date,date);
 if(currency)sql.prepare("INSERT INTO crm_workflow_contracts(deal_id,currency,total_minor,schedule,updated,updated_by) VALUES(?,?,?,'[]',?,'admin')").run(id,currency,amount,date);
}
sql.exec("INSERT INTO crm_receipts VALUES('receipt','R1','repeat',12000,'CNY','2026-11-01',0,'2026-11-01','admin');INSERT INTO crm_workflow_refunds VALUES('refund','REF1','receipt',2000,'2026-11-02','测试退款','2026-11-02','admin');");
const before=JSON.stringify(['crm_leads','crm_deals','crm_receipts','crm_workflow_contracts','crm_workflow_refunds'].map(t=>sql.prepare('SELECT * FROM '+t).all()));
const get=(query='period=month&month=2026-10',u=admin)=>call(db,u,u,'sales-management/report','GET',{},new URL('http://test/?'+query));
const save=(items,u=admin,owner_id='sales',currency='CNY')=>call(db,u,u,'sales-management/targets','POST',{owner_id,currency,items},new URL('http://test'));
let data=await get(),row=data.rows.find(r=>r.id==='sales'&&r.currency==='CNY');
assert.equal(row.new_customers,1);assert.equal(row.effective_customers,2);assert.equal(row.old_customers,1);assert.equal(row.new_minor,30000);assert.equal(row.old_minor,25000);assert.equal(row.deals,3);assert.equal(row.received_minor,10000);assert.equal(row.outstanding_minor,45000);assert.equal(row.target_minor,null);assert.equal(row.completion,null);
assert.equal(data.rows.find(r=>r.id==='foreign').total_minor,10000);assert.equal(data.details.find(d=>d.id==='second').customer_type,'老客户');assert.equal(data.details.length,4);
await assert.rejects(()=>get('',sales),e=>e.status===403);await assert.rejects(()=>save([],ceo),e=>e.status===403);assert.equal((await get('',ceo)).can_edit,false);
const target=(period,start,amount,version=0)=>({period,period_start:start,amount,version});
await save([target('month','2026-10-01','1000'),target('quarter','2026-10-01','5000'),target('year','2026-01-01','10000')]);
assert.equal((await get()).rows.find(r=>r.id==='sales').completion,0.55);assert.equal((await get('period=quarter&year=2026&quarter=4')).rows.find(r=>r.id==='sales').target_minor,500000);assert.equal((await get('period=year&year=2026')).rows.find(r=>r.id==='sales').target_minor,1000000);
await save([target('month','2026-10-01','0',1)]);assert.equal((await get()).rows.find(r=>r.id==='sales').completion,null);assert.equal((await get()).rows.find(r=>r.id==='sales').target_minor,0);
await assert.rejects(()=>save([target('month','2026-11-01','20'),target('month','2026-10-01','2',1)]),e=>e.status===409);assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_sales_targets WHERE period_start='2026-11-01'").get().n,0,'conflict rolls back whole batch');
for(const amount of ['-1','1.001','','NaN','1e5'])await assert.rejects(()=>save([target('month','2026-11-01',amount)]));
await assert.rejects(()=>save([target('quarter','2026-02-01','10')]));await assert.rejects(()=>get('period=custom&start=2026-10-31&end=2026-10-01'));
assert.equal((await get('period=custom&start=2026-10-03&end=2026-10-10')).details.length,2);assert.equal((await get('period=quarter&year=2026&quarter=4')).details.some(d=>d.id==='boundary'),false);
sql.exec("UPDATE crm_workflow_contracts SET currency='USD' WHERE deal_id='repeat'");data=await get();row=data.rows.find(r=>r.id==='sales');assert.equal(row.total_minor,35000);assert.equal(row.unverified,1);assert.equal(row.completion,null);assert.equal(data.details.find(d=>d.id==='repeat').received_minor,null);sql.exec("UPDATE crm_workflow_contracts SET currency='CNY' WHERE deal_id='repeat'");
const input={people:[{id:'sales',name:'sales',active:1,trade_scopes:'["domestic"]'}],leads:[{id:'a',name:'a',owner_id:'sales',grade:'A',entered:'2026-10-01',detail:'{}'},{id:'b',name:'b',owner_id:'sales',grade:'A',entered:'2026-10-02',detail:'{}'}],links:[{lead_id:'a',subject_id:'s'},{lead_id:'b',subject_id:'s'}],deals:[],receipts:[],targets:[]};assert.equal(report(input,new URLSearchParams('month=2026-10'),'2026-10-31').rows[0].new_customers,1,'confirmed subject deduplication');
assert.equal(JSON.stringify(['crm_leads','crm_deals','crm_receipts','crm_workflow_contracts','crm_workflow_refunds'].map(t=>sql.prepare('SELECT * FROM '+t).all())),before,'existing business data unchanged');assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
console.log('PASS sales management: independent targets, concurrency rollback, date boundaries, permissions, customer history/identity, currency isolation, refunds, missing values and preserved business data.');
if(process.env.SALES_PREVIEW_SQL){
 const {writeFileSync}=await import('node:fs');const {passwordHash}=await import(moduleURL('lib/crm.ts'));
 sql.prepare("UPDATE crm_users SET password=? WHERE id='admin'").run(await passwordHash('Local-preview-2026'));
 sql.exec("UPDATE crm_users SET name=CASE id WHEN 'admin' THEN '预览管理员' WHEN 'sales' THEN '业务员甲' WHEN 'foreign' THEN '业务员乙' WHEN 'manager' THEN '管理层' ELSE name END;");
 const tables=['crm_users','crm_leads','crm_deals','crm_workflow_contracts','crm_receipts','crm_workflow_refunds','crm_sales_targets'];
 const quote=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
 const lines=tables.flatMap(t=>sql.prepare('SELECT * FROM '+t).all().map(row=>'INSERT INTO '+t+' ('+Object.keys(row).join(',')+') VALUES ('+Object.values(row).map(quote).join(',')+');'));
 writeFileSync(process.env.SALES_PREVIEW_SQL,lines.join('\n'));
}
