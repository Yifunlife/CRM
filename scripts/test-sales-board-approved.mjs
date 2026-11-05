import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {salesBoardEndpoint:call}=await import(moduleURL('lib/sales-board-server.ts'));
const {rankBoardPeople,boardFollowups}=await import(moduleURL('lib/sales-board.ts'));
const {roleWorkspaceEndpoint}=await import(moduleURL('lib/role-workspace-server.ts'));
const {salesManagementEndpoint}=await import(moduleURL('lib/sales-management-server.ts'));
const {can}=await import(moduleURL('lib/crm.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
const db=database(sql),today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),year=today.slice(0,4),month=today.slice(0,7),previous=(Number(year)-1)+'-06-01';
const users=[['admin','admin',[]],['ceo','ceo',[]],['manager','management',[]],['sales','sales',['domestic']],['foreign','sales',['foreign']],['follow','followup',['domestic']],['operations','operations',[]],['unscoped','sales',[]],['inactive','sales',['domestic']]];
for(const [id,role,scopes] of users)sql.prepare('INSERT INTO crm_users(id,username,name,role,password,active,trade_scopes,created) VALUES(?,?,?,?,?,?,?,?)').run(id,id,id,role,'unused',id==='inactive'?0:1,JSON.stringify(scopes),year+'-01-01');
for(const [id,owner,country,date,grade,detail] of [['dom','sales','中国',month+'-01','A',{}],['old','sales','中国',previous,'B',{}],['foreign-lead','foreign','美国',month+'-01','A',{}],['branch','foreign','美国',month+'-01','B',{_sales_company:'北美分公司'}],['inactive-lead','inactive','中国',month+'-01','A',{}]])sql.prepare("INSERT INTO crm_leads(id,name,owner_id,country,source,entered,created,grade,detail,fingerprint,phone,email) VALUES(?,?,?,?,'Meta',?,?,?,?,?,'private-phone','private@example.test')").run(id,id,owner,country,date,date,grade,JSON.stringify({...detail,secret:'private detail'}),id);
for(const [id,lead,owner,date,currency,amount] of [['dom-deal','dom','sales',month+'-01','CNY',50000],['historic','old','sales',previous,'CNY',70000],['usd-deal','foreign-lead','foreign',month+'-01','USD',20000],['branch-deal','branch','foreign',month+'-01','USD',30000],['inactive-deal','inactive-lead','inactive',month+'-01','CNY',999999]]){
 sql.prepare("INSERT INTO crm_deals(id,order_number,lead_id,owner_id,business_scope,deal_date,created,created_by) VALUES(?,?,?,?,'meta-full',?,?,'admin')").run(id,id,lead,owner,date,date);
 sql.prepare("INSERT INTO crm_workflow_contracts(deal_id,currency,total_minor,schedule,updated,updated_by) VALUES(?,?,?,'[]',?,'admin')").run(id,currency,amount,date);
}
for(const [period,start,amount] of [['month',month+'-01',100000],['year',year+'-01-01',500000]])sql.prepare('INSERT INTO crm_sales_targets(owner_id,currency,period,period_start,amount_minor,version,updated,updated_by) VALUES(?,?,?,?,?,1,?,?)').run('sales','CNY',period,start,amount,today,'admin');
const details={business_stage:'生产中',business_process:{'接单确认':{status:'已完成',customer_followup:{status:'已同步客户'}},'生产跟进':{status:'进行中',due:previous,next:'核对工厂排期'}},secret:'private-order-detail'};
for(const [id,archived] of [['order',0],['same-project-copy',0],['archived',1]])sql.prepare("INSERT INTO crm_followup_orders(id,order_number,project,lead_id,deal_id,commercial_id,logistics_id,details,steps,change_token,archived,created,created_by,updated,updated_by) VALUES(?,?,?,'dom','dom-deal','sales','follow',?,'[]','test',?,?,'admin',?,'admin')").run(id,id,'测试项目',JSON.stringify(details),archived,today,today);
const before=JSON.stringify(['crm_users','crm_leads','crm_deals','crm_followup_orders','crm_sales_targets'].map(t=>sql.prepare('SELECT * FROM '+t).all()));
const url=new URL('https://crm.test/api/sales-board/report?period=month&month='+month);
const reports=[];
for(const [id,role,scopes] of users.filter(u=>u[0]!=='inactive')){const user={id,role,active:1,trade_scopes:scopes};reports.push(await call(db,user,'sales-board/report','GET',url));assert.equal(can(user,'customers_all'),['admin','ceo','management','operations'].includes(role));}
for(const report of reports){
 assert.equal(report.all.summary.total_customers,4);assert.equal(report.monthly.rows.some(p=>p.id==='follow'||p.id==='inactive'),false);
 const row=report.monthly.rows.find(p=>p.id==='sales'&&p.currency==='CNY');assert.equal(row.annual_customers,1);assert.equal(row.new_customers,1);assert.equal(row.annual_target_minor,500000);assert.equal(row.target_minor,100000);assert.equal(row.annual_total_minor,50000);
 assert.equal(report.followups[0].projects,1,'linked duplicate orders count as one project');assert.equal(report.followups[0].overdue,1);assert.equal(report.followups[0].stages.find(s=>s.name==='生产中').count,1);
 assert.deepEqual(report.companies.find(c=>c.name==='总公司').total,{CNY:120000,USD:20000});assert.deepEqual(report.companies.find(c=>c.name==='北美分公司').total,{USD:30000});
 assert.equal(report.trades.find(t=>t.currency==='CNY').total,50000);assert.equal(report.trades.find(t=>t.currency==='USD').total,50000);
 assert.equal(report.trades.find(t=>t.currency==='CNY').monthly,50000);assert.equal(report.trades.find(t=>t.currency==='USD').monthly,50000);
 const encoded=JSON.stringify(report);for(const secret of ['private-phone','private@example.test','private detail','private-order-detail','password','change_token'])assert.equal(encoded.includes(secret),false,'dashboard strips '+secret);
}
const sales={id:'sales',role:'sales',active:1,trade_scopes:['domestic']};
await assert.rejects(()=>call(db,{...sales,active:0},'sales-board/report','GET',url),e=>e.status===403);
await assert.rejects(()=>call(db,sales,'sales-board/report','POST',url),e=>e.status===405);
await assert.rejects(()=>salesManagementEndpoint(db,sales,sales,'sales-management/report','GET',{},url),e=>e.status===403,'board does not grant general sales management access');
const personal=await roleWorkspaceEndpoint(db,sales,sales,'role-workspace/report','GET',{},new URL('https://crm.test/?market='+encodeURIComponent('内贸')+'&month='+month));assert.equal(personal.personal,true);assert.equal(personal.all_customers.length,2,'personal reports remain isolated');
const contact=await call(db,{id:'follow',role:'followup',active:1},'sales-board/first-contact','GET',new URL('https://crm.test/?market='+encodeURIComponent('外贸')));assert.equal(contact.market,'外贸');for(const person of contact.people)assert.equal('pending' in person,false);
const fixtures=[{id:'a',name:'A',annual_total_minor:100,total_minor:20,new_customers:2,effective_customers:1,annual_unverified:0,unverified:0},{id:'b',name:'B',annual_total_minor:100,total_minor:30,new_customers:1,effective_customers:2,annual_unverified:0,unverified:0},{id:'c',name:'C',annual_total_minor:200,total_minor:50,new_customers:3,effective_customers:3,annual_unverified:1,unverified:0}];
assert.deepEqual(rankBoardPeople(fixtures,'annual').map(p=>p.rank),[1,1,null]);assert.equal(rankBoardPeople(fixtures,'monthly')[0].id,'c');assert.equal(rankBoardPeople(fixtures,'customers')[0].id,'c');assert.equal(rankBoardPeople(fixtures,'grade')[0].id,'c');
assert.equal(boardFollowups([{id:'empty',logistics_id:'follow',details:{},steps:[],archived:0}], [{id:'follow',name:'跟单员',active:1,role:'followup'}],[],today)[0].overdue,0,'unset schedules never imply overdue');
assert.equal(before,JSON.stringify(['crm_users','crm_leads','crm_deals','crm_followup_orders','crm_sales_targets'].map(t=>sql.prepare('SELECT * FROM '+t).all())),'reports never mutate business records');
console.log('PASS approved sales board: all employee roles/unscoped access; private fields omitted; original customer permissions preserved; separate annual/month targets and customers; currency/history/company isolation; active staff, linked project deduplication, overdue and missing schedules; tie rankings; no data writes.');
// Exercise the authenticated route as well as the report module, including the followup guard.
const {build}=await import('esbuild');
const {mkdtempSync,rmSync,writeFileSync}=await import('node:fs');
const {tmpdir}=await import('node:os');
const {digest}=await import(moduleURL('lib/crm.ts'));
for(const [id] of users.filter(u=>u[0]!=='inactive'))sql.prepare('INSERT INTO crm_sessions(token,user_id,expires) VALUES(?,?,?)').run(await digest('board-test-'+id),id,Date.now()+3600000);
const dir=mkdtempSync(tmpdir()+'/sales-board-route-');
try{
 globalThis.__salesBoardTestEnv={DB:db};
 await build({entryPoints:['app/api/[...path]/route.ts'],bundle:true,platform:'node',format:'esm',outfile:dir+'/route.mjs',plugins:[{name:'board-test-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__salesBoardTestEnv;'}));}}],logLevel:'silent'});
 const route=await import(dir+'/route.mjs');
 for(const [id] of users.filter(u=>u[0]!=='inactive')){
  const response=await route.GET(new Request(url,{headers:{cookie:'crm_session=board-test-'+id}}));assert.equal(response.status,200,id+' can read board through auth guard');const report=await response.json();assert.equal(report.all.summary.total_customers,4);
  const notices=await route.GET(new Request('https://crm.test/api/sales-board/first-contact?market='+encodeURIComponent('外贸'),{headers:{cookie:'crm_session=board-test-'+id}}));assert.equal(notices.status,200,id+' can expand first-contact counts');
 }
 const anonymous=await route.GET(new Request(url));assert.equal(anonymous.status,401);
 const blocked=await route.POST(new Request(url,{method:'POST',headers:{origin:'https://crm.test',cookie:'crm_session=board-test-follow','Content-Type':'application/json'},body:'{}'}));assert.equal(blocked.status,405);
 console.log('PASS authenticated sales board API: every role and unscoped accounts, followup guard, anonymous 401 and write 405.');
 if(process.env.BOARD_DB_PATH){const {backup}=await import('node:sqlite');await backup(sql,process.env.BOARD_DB_PATH);}
 if(process.env.BOARD_FIXTURE_PATH)writeFileSync(process.env.BOARD_FIXTURE_PATH,JSON.stringify(reports[0]));
}finally{rmSync(dir,{recursive:true,force:true});delete globalThis.__salesBoardTestEnv;}
