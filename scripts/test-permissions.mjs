import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const moduleUrl=(file,replacements={})=>{let source=readFileSync(file,'utf8');for(const [from,to] of Object.entries(replacements))source=source.replaceAll(from,to);return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');};
const errors='data:text/javascript,export class AllocationError extends Error {constructor(message,status=400){super(message);this.status=status;}}';
const workflow=moduleUrl('lib/order-followup.ts');
const importRules=moduleUrl('lib/order-import.ts',{"'./order-followup'":JSON.stringify(workflow)});
const importServer=moduleUrl('lib/order-import-server.ts',{"'./allocation-server'":JSON.stringify(errors),"'./crm'":JSON.stringify(moduleUrl('lib/crm.ts')),"'./order-followup'":JSON.stringify(workflow),"'./order-import'":JSON.stringify(importRules)});
const {moduleURL}=await import('./test-form-intake.mjs');
const server=moduleURL('lib/order-followup-server.ts');
const {followupEndpoint,followupOrder}=await import(server),{ORDER_STEPS,orderReminders,blankSteps}=await import(workflow);
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}async run(){return {meta:sqlite.prepare(this.sql).run(...this.args)};}}
const db={prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const admin={id:'admin',role:'admin',name:'管理员'},staff={id:'staff',role:'operations',name:'后勤测试'},sales={id:'sales',role:'sales',name:'商务测试'},other={id:'other',role:'sales',name:'其他业务'};
for(const u of [admin,staff,sales,other])sqlite.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.name,u.role,'unchanged','2026-10-22');
for(const [id,owner] of [['lead1','sales'],['lead2','other']])sqlite.prepare("INSERT INTO crm_leads(id,name,source,owner_id,detail,fingerprint,created) VALUES(?,?,'Meta',?,'{}',?,'2026-10-22')").run(id,id,owner,id);

const crmUrl=moduleUrl('lib/crm.ts'),{can,permissionDefaults,authorizedLead}=await import(crmUrl);
const {setAccountPermissions}=await import(moduleUrl('lib/account-edit.ts',{"'./account-classification'":JSON.stringify(moduleUrl('lib/account-classification.ts')),"'./crm'":JSON.stringify(crmUrl),"'./allocation-server'":JSON.stringify(errors)}));
const {allocationEndpoint}=await import(moduleURL('lib/allocation-server.ts'));
const initial=sqlite.prepare("SELECT username,password,name FROM crm_users WHERE id='sales'").get();
const ceoPermissions=permissionDefaults('ceo');
await assert.rejects(setAccountPermissions(db,sales,{id:'sales',role:'ceo',permissions:ceoPermissions}),e=>e.status===403);
await assert.rejects(setAccountPermissions(db,admin,{id:'sales',role:'admin',permissions:ceoPermissions}),/管理员/);
await assert.rejects(setAccountPermissions(db,admin,{id:'admin',role:'ceo',permissions:ceoPermissions}),/管理员/);
await assert.rejects(setAccountPermissions(db,admin,{id:'sales',role:'ceo',permissions:{...ceoPermissions,unknown:true}}),/完整/);
await assert.rejects(setAccountPermissions(db,admin,{id:'sales',role:'ceo',permissions:{...ceoPermissions,followup_edit:true,followup_all:false}}),/查看/);
await setAccountPermissions(db,admin,{id:'sales',role:'ceo',permissions:ceoPermissions});
const ceo=sqlite.prepare("SELECT id,role,permissions FROM crm_users WHERE id='sales'").get();
assert.deepEqual(sqlite.prepare("SELECT username,password,name FROM crm_users WHERE id='sales'").get(),initial);
assert.equal(sqlite.prepare("SELECT owner_id FROM crm_leads WHERE id='lead1'").get().owner_id,'sales');
assert.equal(can(ceo,'customers_all'),true);assert.equal(can(ceo,'customers_edit'),true);assert.equal(can(ceo,'leads_allocate'),true);assert.equal(can(ceo,'performance_view'),true);assert.equal(can(ceo,'followup_all'),true);assert.equal(can(ceo,'followup_edit'),true);
assert.equal(authorizedLead(ceo,{owner_id:'other'}),true);assert.equal(authorizedLead(other,{owner_id:'sales'}),false);
const endpoint=(path,method,body={})=>allocationEndpoint(db,ceo,path,method,body,new URL('https://test.invalid/api/'+path));
assert.equal((await endpoint('allocation/report','GET')).receiptPolicy,true);
await assert.rejects(endpoint('allocation/config','POST',{}),e=>e.status!==403); // Validation reached; CEO has allocation maintenance access.
await assert.rejects(endpoint('allocation/confirm','POST',{}),e=>e.status!==403);
await assert.rejects(endpoint('allocation/distribute','POST',{}),e=>e.status!==403);
await followupEndpoint(db,admin,admin,'followup/staff','POST',{user_id:'staff',enabled:true});
const created=await followupEndpoint(db,admin,admin,'followup','POST',{project:'Permission test',order_number:'PERMISSIONS-ORDER',lead_id:'lead2',logistics_id:'staff'});
assert.equal((await followupEndpoint(db,ceo,ceo,'followup','GET',{})).orders.length,1);
assert.equal((await followupOrder(db,ceo,created.id)).manager,true);
await assert.rejects(followupEndpoint(db,ceo,ceo,'followup','POST',{project:'Missing fields'}),e=>e.status!==403);
await followupEndpoint(db,ceo,ceo,'followup/staff','POST',{user_id:'sales',enabled:true});
const viewOnly={...permissionDefaults('operations'),customers_all:false,customers_edit:false,leads_allocate:false,performance_view:false,followup_all:false,followup_edit:false};
await setAccountPermissions(db,admin,{id:'staff',role:'operations',permissions:viewOnly});
const revoked=sqlite.prepare("SELECT id,role,permissions FROM crm_users WHERE id='staff'").get();
await assert.rejects(followupEndpoint(db,revoked,revoked,'followup','GET',{}),e=>e.status===403);
assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
console.log('PASS: CEO defaults, granular permissions, own/all visibility, administrator/CEO business access, administrator protection, unknown/dependent permission rejection, cross-owner followup maintenance, allocation vs rule separation, logistics grant revocation and unchanged credentials/ownership.');

assert.equal(permissionDefaults('management').leads_allocate,true);
assert.equal(permissionDefaults('ceo').advertising_view,true);
const beforeManagement=sqlite.prepare("SELECT username,password,name FROM crm_users WHERE id='other'").get();
await setAccountPermissions(db,admin,{id:'other',role:'management',permissions:permissionDefaults('management')});
const management=sqlite.prepare("SELECT id,role,permissions FROM crm_users WHERE id='other'").get();
assert.equal(authorizedLead(management,{owner_id:'sales'}),true);
assert.equal(can(management,'leads_allocate'),false);assert.equal(can(management,'performance_view'),true);
assert.equal(can(management,'customers_edit'),false);assert.equal(can(management,'followup_edit'),false);
assert.deepEqual(sqlite.prepare("SELECT username,password,name FROM crm_users WHERE id='other'").get(),beforeManagement);
assert.equal(sqlite.prepare("SELECT owner_id FROM crm_leads WHERE id='lead2'").get().owner_id,'other');
assert.equal((await allocationEndpoint(db,management,'allocation/report','GET',{},new URL('https://test.invalid/api/allocation/report'))).receiptPolicy,true);
await assert.rejects(allocationEndpoint(db,management,'allocation/config','POST',{},new URL('https://test.invalid/api/allocation/config')),e=>e.status===403);
await assert.rejects(setAccountPermissions(db,management,{id:'other',role:'admin',permissions:permissionDefaults('admin')}),e=>e.status===403);
await followupEndpoint(db,admin,admin,'followup','POST',{project:'Other owner order',order_number:'MANAGEMENT-READ-ALL',lead_id:'lead1',logistics_id:'admin'});
const managementOrders=await followupEndpoint(db,management,management,'followup','GET',{});
assert.equal(managementOrders.orders.length,2);assert.equal(managementOrders.can_manage,false);
await assert.rejects(followupEndpoint(db,management,management,'followup','POST',{project:'Denied'}),e=>e.status===403);
console.log('PASS: management role retains its existing defaults, reads company-wide projects and performance, cannot allocate leads or maintain rules/accounts/followup or self-escalation, and preserves credentials and ownership.');

// Sales stays personal even when a historical permission record grants company-wide access.
const broadSales={...other,permissions:JSON.stringify(Object.fromEntries(Object.keys(permissionDefaults('sales')).map(k=>[k,true])))};
for(const key of ['customers_all','leads_allocate','performance_view','advertising_view','advertising_edit'])assert.equal(can(broadSales,key),false,key);
assert.equal(can(broadSales,'customers_edit'),true);
assert.equal(authorizedLead(broadSales,{owner_id:'sales'}),false);
assert.equal(authorizedLead(broadSales,{owner_id:other.id}),true);
await assert.rejects(setAccountPermissions(db,admin,{id:'staff',role:'sales',permissions:{...permissionDefaults('sales'),customers_all:true}}),/业务员仅使用本人/);
console.log('PASS: historical broad sales grants cannot expose other customers or advertising; normal own-customer editing and management permissions remain available.');

const {ceoRequestAllowed}=await import(crmUrl);
for(const permissions of [Object.fromEntries(Object.keys(ceoPermissions).map(k=>[k,true])),Object.fromEntries(Object.keys(ceoPermissions).map(k=>[k,false]))]){
 const legacy={...ceo,permissions};
 for(const key of Object.keys(ceoPermissions))assert.equal(can(legacy,key),ceoPermissions[key],key);
}
for(const path of ['google/config','google/forms/config','google/start','cloud/settings','cloud/limit','service/settings','workbench/bridge','workbench/snapshot','linked/connect','linked/disconnect']){
 for(const method of ['POST','PATCH','DELETE','PUT'])assert.equal(ceoRequestAllowed(ceo,path,method),false,path+method);
}
for(const path of ['users','google/status','service/inbox','workflow/report'])assert.equal(ceoRequestAllowed(ceo,path,'GET'),true);
for(const path of ['logout','password','service/conversation','assign','users','users/permissions','sales-suite/project/record','followup/priority','service/register','deals','receipts'])assert.equal(ceoRequestAllowed(ceo,path,'POST'),true);
await assert.rejects(setAccountPermissions(db,admin,{id:ceo.id,role:'ceo',permissions:{...ceoPermissions,customers_edit:false}}),/CEO业务权限/);
sqlite.prepare('INSERT OR IGNORE INTO crm_followup_staff(user_id) VALUES(?)').run(ceo.id);
assert.equal((await followupOrder(db,ceo,created.id)).manager,true);
console.log('PASS: CEO historical overrides retain full business permissions; system configuration writes are denied and management reads remain available.');

// CEO edits accounts and confirms finance using the original identity; unrelated roles remain restricted.
const {editAccount,resetAccountPassword}=await import(moduleURL('lib/account-edit.ts'));
await editAccount(db,ceo,{id:'staff',name:'Updated by CEO',username:'staff'});
assert.equal(sqlite.prepare("SELECT name FROM crm_users WHERE id='staff'").get().name,'Updated by CEO');
await setAccountPermissions(db,ceo,{id:'staff',role:'operations',permissions:permissionDefaults('operations')});
const {financeRecords}=await import(moduleURL('lib/api/finance.ts'));
sqlite.exec("UPDATE crm_leads SET business_scope='meta-full' WHERE id='lead2'");
const finance=(path,method,body,user=ceo)=>financeRecords({db,req:new Request('https://test.invalid/api/'+path,{method}),path,body,user,actor:user});
await finance('deals','POST',{lead_id:'lead2',order_number:'CEO-DEAL',deal_date:'2026-10-22'});
const deal=sqlite.prepare("SELECT * FROM crm_deals WHERE order_number='CEO-DEAL'").get();
assert.equal(deal.created_by,ceo.id);
await finance('receipts','POST',{deal_id:deal.id,reference:'CEO-RECEIPT',currency:'USD',amount:'123.45',received_date:'2026-10-22'});
const receipt=sqlite.prepare("SELECT * FROM crm_receipts WHERE reference='CEO-RECEIPT'").get();
assert.equal(receipt.amount_minor,12345);assert.equal(receipt.created_by,ceo.id);
await assert.rejects(finance('receipts','POST',{},management),e=>e.status===403);
await finance('receipts','PATCH',{id:receipt.id,reason:'Test reversal'});
await finance('deals','PATCH',{id:deal.id,reason:'Test reversal'});
assert.equal(sqlite.prepare('SELECT cancelled FROM crm_deals WHERE id=?').get(deal.id).cancelled,1);
assert.equal(sqlite.prepare("SELECT role FROM crm_users WHERE id=?").get(ceo.id).role,'ceo');
assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
console.log('PASS: CEO account editing, permissions, deal and receipt confirmations/reversals preserve actor identity; management cannot write finance.');

const {operationsEndpoint}=await import(moduleURL('lib/operations-server.ts'));
const {advertisingEndpoint}=await import(moduleURL('lib/advertising-server.ts'));
const account=await operationsEndpoint(db,ceo,'operations/accounts','POST',{name:'CEO managed account',platform:'Instagram',owner_id:ceo.id});
await advertisingEndpoint(db,ceo,'advertising','POST',{account_id:account.id,name:'CEO campaign',platform:'Meta',date:'2026-10-22',status:'投放中',owner_id:ceo.id,budget:'100',spent:'10',notes:''});
const ad=sqlite.prepare("SELECT * FROM crm_advertising WHERE name='CEO campaign'").get();assert.equal(ad.owner_id,ceo.id);assert.equal(ad.created_by,ceo.id);
await assert.rejects(operationsEndpoint(db,management,'operations/accounts','POST',{}),e=>e.status===403);
console.log('PASS: CEO can maintain operations and advertising with its own identity; unprivileged management remains restricted.');
