import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync,backup} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {salesWorkflowEndpoint:handle}=await import(moduleURL('lib/sales-workflow-server.ts'));
const {digest}=await import(moduleURL('lib/crm.ts'));
const {suiteDay}=await import(moduleURL('lib/sales-suite.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
const db=database(sql),admin={id:'admin',role:'admin'},sales={id:'sales',role:'sales',trade_scopes:['domestic']},foreign={id:'foreign',role:'sales',trade_scopes:['foreign']},ceo={id:'ceo',role:'ceo'};
for(const u of [admin,sales,foreign,ceo]){
 sql.prepare('INSERT INTO crm_users(id,username,name,role,password,trade_scopes,created) VALUES(?,?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'fixture',JSON.stringify(u.trade_scopes||[]),'2026-11-01');
 sql.prepare('INSERT INTO crm_sessions(token,user_id,expires) VALUES(?,?,?)').run(await digest('summary-test-'+u.id),u.id,Date.now()+3600000);
}
const leads=[['dom','sales','内贸','美国','已成交','A'],['dom-other','foreign','内贸','中国','正在沟通','B'],['exp','foreign','外贸','中国','已联系待回复','A'],['legacy','foreign','待确认','美国','待首次联系','B'],['unknown',null,'待确认','','暂停跟进',''],['colleague','sales','内贸','中国','待首次联系','Yifun Staff']];
for(const [id,owner,market,country,status,grade] of leads)sql.prepare('INSERT INTO crm_leads(id,name,owner_id,market,country,status,grade,detail,fingerprint,created,phone,email,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'PRIVATE '+id,owner,market,country,status,grade,JSON.stringify({secret:'never expose'}),id,'2026-11-01','private phone','private email','');
const today=suiteDay();
for(const [lead,owner] of [['dom','sales'],['exp','foreign']])sql.prepare('INSERT INTO crm_assignments(id,lead_id,owner_id,policy,created,user_id) VALUES(?,?,?,?,?,?)').run(lead,lead,owner,'manual',today+'T00:00:00Z','admin');
const request=(user,params)=>handle(db,user,user,'sales-management/customers','GET',{},new URL('https://test/?'+new URLSearchParams(params)));
const before=JSON.stringify(['crm_leads','crm_assignments','crm_users'].map(t=>sql.prepare('SELECT * FROM '+t).all()));
for(const user of [admin,sales,foreign,ceo]){
 const result=await request(user,{summary:'1',owner:'sales',state:'已成交',q:'no match',market:'内贸'});
 assert.equal(result.total,5,'summary ignores employee, status, search and market filters');assert.equal(result.counts.reduce((n,r)=>n+r.count,0),5);assert.deepEqual(result.rows,[]);assert.deepEqual(result.meetings,[]);assert(!JSON.stringify(result).includes('PRIVATE'));assert(!JSON.stringify(result).includes('private phone'));assert(!JSON.stringify(result).includes('never expose'));
 const domestic=result.overview.markets.find(m=>m.name==='内贸'),exported=result.overview.markets.find(m=>m.name==='外贸');assert.equal(domestic.count,2);assert.equal(exported.count,2);assert.equal(result.overview.markets.find(m=>m.name==='待确认').count,1);
 assert.equal(domestic.counts.find(r=>r.status==='已成交').count,1);assert.equal(domestic.counts.find(r=>r.status==='待首次联系').count,0);assert.equal(exported.counts.find(r=>r.status==='待首次联系').count,1);
 assert.equal(result.allocationSummary.cumulative,2);assert.equal(result.allocationSummary.markets.length,2);
}
const own=await request(sales,{});assert.equal(own.total,1);assert.deepEqual(own.rows.map(r=>r.id),['dom']);
assert.equal((await request(sales,{owner:'foreign'})).total,0,'global summaries do not widen customer detail permissions');
assert.deepEqual((await request(admin,{market:'内贸',state:'已成交'})).rows.map(r=>r.id),['dom']);
assert.deepEqual((await request(admin,{market:'外贸',state:'待首次联系'})).rows.map(r=>r.id),['legacy'],'drilldown uses the same legacy market classification as the card');
assert.deepEqual((await request(admin,{market:'待确认'})).rows.map(r=>r.id),['unknown']);
assert.equal((await request(admin,{market:'外贸',owner:'sales'})).total,0);
assert.equal(before,JSON.stringify(['crm_leads','crm_assignments','crm_users'].map(t=>sql.prepare('SELECT * FROM '+t).all())),'read-only reporting');
if(process.env.SUMMARY_DB_PATH)await backup(sql,process.env.SUMMARY_DB_PATH);
console.log('PASS global overview independent of employee/filter state; all market/status totals and allocation counts; no private customer payload; existing detail permissions; market/status/owner drilldown; no data writes.');
