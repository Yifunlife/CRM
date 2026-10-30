import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
const tmp=mkdtempSync(tmpdir()+'/crm-role-test-');
try{
await build({entryPoints:['lib/role-workspaces.ts'],bundle:true,platform:'node',format:'esm',outfile:tmp+'/role.mjs'});
const {roleWorkspaceEndpoint,followupPerformance}=await import(tmp+'/role.mjs');
const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}}
const db={prepare:sql=>new Statement(sql)},url=new URL('https://test/api/sales-amounts?month=2026-10');
for(const role of ['sales','followup','operations'])await assert.rejects(()=>roleWorkspaceEndpoint(db,{id:'x',role},'sales-amounts','GET',url),e=>e.status===403);
const admin={id:'admin',role:'admin'};for(const id of ['admin','sales'])sqlite.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(id,id,id,id,'unused','2026-10-30');
for(const [id,cohort,original] of [['new','new',''],['old','historical',''],['legacy','new','old-owner']])sqlite.prepare("INSERT INTO crm_leads(id,name,source,cohort,original_owner,fingerprint,detail,created) VALUES(?,?,'Meta',?,?,?,'{}','2026-10-30')").run(id,id,cohort,original,id);
let result=await roleWorkspaceEndpoint(db,admin,'role-home','GET',url);assert.deepEqual(result.todos.map(r=>r.name),['new']);
sqlite.exec("INSERT INTO crm_deals(id,order_number,lead_id,owner_id,business_scope,deal_date,created,created_by) VALUES('d','SO1','new','sales','meta-full','2026-10-20','2026-10-20','admin'); INSERT INTO crm_workflow_contracts(deal_id,currency,total_minor,schedule,updated,updated_by) VALUES('d','USD',10000,'[]','2026-10-20','admin'); INSERT INTO crm_receipts(id,reference,deal_id,currency,amount_minor,received_date,created,created_by) VALUES('r','R','d','USD',4000,'2026-10-21','2026-10-21','admin'); INSERT INTO crm_workflow_refunds(id,reference,receipt_id,amount_minor,refunded_date,reason,created,created_by) VALUES('f','F','r',500,'2026-10-22','return','2026-10-22','admin');");
result=await roleWorkspaceEndpoint(db,admin,'sales-amounts','GET',url);assert.equal(result.rows[0].total_minor,10000);assert.equal(result.rows[0].received_minor,3500);
sqlite.exec("INSERT INTO crm_deals(id,order_number,lead_id,owner_id,business_scope,deal_date,cancelled,created,created_by) VALUES('void','SO2','new','sales','meta-full','2026-10-20',1,'2026-10-20','admin')");assert.equal((await roleWorkspaceEndpoint(db,admin,'sales-amounts','GET',url)).rows.length,1);
await assert.rejects(()=>roleWorkspaceEndpoint(db,admin,'sales-amounts','GET',new URL('https://test/?month=bad')),e=>e.status===400);
const base={logistics_id:'me',deal_id:'d',currency:'USD',total_minor:10000,details:{execution:{stages:{acceptance:{status:'已完成',values:{date:'2026-10-25'}}}}}};
let performance=followupPerformance([base,base,{...base,deal_id:'other',logistics_id:'other'},{...base,deal_id:'cancelled',cancelled:1},{...base,deal_id:'unpriced',total_minor:null},{...base,deal_id:'open',details:{}}],'me','2026-10');assert.equal(performance.contracts[0].amount,20000);assert.equal(performance.delivered[0].amount,10000);
assert.equal(followupPerformance([base],'me','2026-11').delivered.length,0);
await build({entryPoints:['lib/order-followup-server.ts'],bundle:true,platform:'node',format:'esm',outfile:tmp+'/followup.mjs'});
const {followupEndpoint}=await import(tmp+'/followup.mjs');
sqlite.exec("INSERT INTO crm_users(id,username,name,role,password,created) VALUES('logistics','logistics','跟单','followup','unused','2026-10-30'); INSERT INTO crm_followup_orders(id,order_number,project,lead_id,deal_id,commercial_id,logistics_id,details,steps,change_token,created,created_by,updated,updated_by) VALUES('order','SO1','项目','new','d','sales','logistics','{}','[]','v','2026-10-30','admin','2026-10-30','admin')");
const user={id:'logistics',role:'followup'};const followup=await followupEndpoint(db,user,user,'followup','GET',{});assert.equal(followup.performance.contracts[0].amount,10000);assert.equal(followup.orders[0].contract_amount,10000);assert.equal(followup.performance.delivered.length,0);
console.log('PASS roles, new allocation scope, financial totals/refunds/cancellation, month validation, personal delivery scope, deduplication and acceptance dates');
}finally{rmSync(tmp,{recursive:true,force:true})}
