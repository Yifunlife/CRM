import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {roleWorkspaceEndpoint:call}=await import(moduleURL('lib/role-workspace-server.ts'));
const {customerProfile,validateCustomerProfile,customerContractNumber}=await import(moduleURL('lib/customer-profile.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
const db=database(sql),sales={id:'sales',role:'sales'},other={id:'other',role:'sales'},admin={id:'admin',role:'admin'},management={id:'manager',role:'management'};
for(const u of [sales,other,admin,management])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-11-01');
const raw={原始需求:'原内容保留',附件地址:'existing.pdf',platform:'ig',_sales_progress:{first:{whatsapp:{at:'2026-10-01T01:00:00.000Z',note:'真实联系'}}},_workbench:{desktop_id:'IN-demo',project:'原项目',stage:3,customerType:'商户',nextAction:'原下一步',notes:'原备注',amount:'5000',lastContact:'2026-10-02'}};
sql.prepare("INSERT INTO crm_leads(id,name,source,country,phone,email,grade,owner_id,detail,fingerprint,created,last_contact) VALUES('lead','原姓名','Meta','India','123','old@example.com','D','sales',?,'lead','2026-10-01','2026-10-02T01:00:00.000Z')").run(JSON.stringify(raw));
sql.exec("INSERT INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES('note','lead','sales','原跟进','WhatsApp','真实下一步','2026-10-02')");
const row=()=>sql.prepare("SELECT * FROM crm_leads WHERE id='lead'").get();
const notes=()=>JSON.stringify(sql.prepare('SELECT * FROM crm_notes').all());const notesBefore=notes();
const payload=()=>{const l=row(),d=JSON.parse(l.detail);return {id:l.id,revision:d._profile_revision||0,base:Object.fromEntries(['source','name','country','phone','email','grade','next_date'].map(k=>[k,l[k]])),country:l.country,method:d['偏好联系方式']||'',source_note:d['客户来源说明']||'',company:d._sales_company||'',contacts:d._contacts||[],profile:{}};};
const post=(body,user=sales)=>call(db,user,user,'role-workspace/customer','POST',body,new URL('http://test/'));
assert.equal(customerProfile(row()).project,'原项目');assert.equal(customerProfile(row()).stage,'3');assert.equal(customerProfile(row()).notes,'原备注');
const body={...payload(),name:'补充姓名',phone:'+91 5550001',email:'new@example.com',grade:'A',country:'India',method:'WhatsApp',company:'澳洲分公司',source_note:'朋友介绍',source:'伪造来源',owner_id:'other',profile:{contact:'采购',organization:'示例公司',city:'Delhi',role:'负责人',customerType:'集团公司',notes:'新备注'}};
await post(body);let updated=row(),detail=JSON.parse(updated.detail);assert.equal(updated.name,'补充姓名');assert.equal(updated.grade,'A');assert.equal(updated.phone,'+91 5550001');assert.equal(updated.email,'new@example.com');assert.equal(updated.owner_id,'sales');assert.equal(updated.source,'Meta');assert.deepEqual(detail._workbench,raw._workbench);assert.deepEqual(detail._sales_progress,raw._sales_progress);assert.equal(detail['原始需求'],raw['原始需求']);assert.equal(detail['附件地址'],raw['附件地址']);assert.equal(detail._customer_profile.organization,'示例公司');assert.equal(detail._profile_revision,1);
await assert.rejects(()=>post(body),e=>e.status===409);
await assert.rejects(()=>post(payload(),other),e=>e.status===404);
await assert.rejects(()=>post(payload(),management),e=>e.status===403);
const same=row();await assert.rejects(()=>post({...payload(),email:'invalid'}),/邮箱/);await assert.rejects(()=>post({...payload(),grade:'Q'}),/等级/);await assert.rejects(()=>post({...payload(),next_date:'2026-02-30'}),/日期/);assert.deepEqual(row(),same);
for(const profile of [{stage:'10'},{projectStatus:'未知'},{followStatus:'未知'},{currency:'EUR'},{amount:'-1'},{amount:'1.001'},{closeDate:'2026-02-30'},{owner_id:'other'},{notes:123}])assert.throws(()=>validateCustomerProfile(profile));
await post({...payload(),profile:{project:'新项目',stage:'5',projectStatus:'进行中',amount:'1500.25',currency:'USD',closeDate:'2026-11-03',lostReason:''}},admin);
await post({...payload(),next_date:'2026-11-08',profile:{nextAction:'确认需求',followStatus:'本周跟进'}},sales);
let profile=customerProfile(row());assert.equal(profile.project,'新项目');assert.equal(profile.organization,'示例公司');assert.equal(profile.notes,'新备注');assert.equal(profile.nextAction,'确认需求');assert.equal(row().next_date,'2026-11-08');
const stale=payload();sql.prepare("UPDATE crm_leads SET phone='newer-phone' WHERE id='lead'").run();await assert.rejects(()=>post(stale),e=>e.status===409);assert.equal(row().phone,'newer-phone');
await post({...payload(),profile:{city:'',notes:''}});profile=customerProfile(row());assert.equal(profile.city,'');assert.equal(profile.notes,'');assert.equal(profile.project,'新项目');
// Legacy callers can still update their existing subset without erasing the new dossier fields.
await post({id:'lead',revision:JSON.parse(row().detail)._profile_revision,country:'Australia',method:'邮件',source_note:'原来源说明',contacts:[]});assert.equal(customerProfile(row()).project,'新项目');assert.equal(row().phone,'newer-phone');
assert.equal(row().last_contact,'2026-10-02T01:00:00.000Z');assert.equal(notes(),notesBefore);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_deals').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_receipts').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_workbench_commands').get().n,0);assert(sql.prepare("SELECT COUNT(*) n FROM crm_workflow_audit WHERE kind='更新客户档案'").get().n>0);
assert.equal(customerProfile({...row(),notes:[{next_step:'后续真实跟进',created:'2099-01-01'}]}).nextAction,'后续真实跟进','a later real follow-up supersedes an earlier saved plan');
console.log('PASS customer dossier: real fields, snapshot fallbacks, partial saves, explicit clears, original-source/owner/history/file preservation, stale revision/column rejection, validation, sales isolation, legacy compatibility, and no messages/deals/receipts created.');

assert.equal(customerContractNumber({id:'internal-id',detail:{_customer_code:'AU20261102',_workbench:{desktop_id:'AU20261102'}}}), '');
assert.equal(customerContractNumber({deals:[{order_number:'YF-001',cancelled:0},{order_number:'VOID',cancelled:1},{order_number:'YF-002',cancelled:0},{order_number:'YF-001',cancelled:0}]}),'YF-001、YF-002');

// Company-view management keeps the same own-customer editing available in personal view.
const ownManager={...management,permissions:{customers_all:true,customers_edit:false}};
sql.prepare("UPDATE crm_leads SET owner_id='manager' WHERE id='lead'").run();
const originalDetail=JSON.parse(row().detail),auditCount=sql.prepare('SELECT COUNT(*) n FROM crm_workflow_audit').get().n;
await post({...payload(),name:'管理者维护的客户',profile:{city:'Sydney'}},ownManager);
assert.equal(row().name,'管理者维护的客户');assert.equal(customerProfile(row()).city,'Sydney');
assert.equal(row().owner_id,'manager');assert.equal(row().source,'Meta');assert.equal(notes(),notesBefore);
assert.deepEqual(JSON.parse(row().detail)._workbench,originalDetail._workbench);
assert.deepEqual(JSON.parse(row().detail)._sales_progress,originalDetail._sales_progress);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_workflow_audit').get().n,auditCount+1);
const saved=row();
await assert.rejects(()=>post(payload(),{...ownManager,id:'other-manager'}),e=>e.status===403);
await assert.rejects(()=>post(payload(),{id:'manager',role:'sales',permissions:{customers_edit:false}}),e=>e.status===403);
await assert.rejects(()=>post(payload(),{id:'manager',role:'followup'}),e=>e.status===403);
assert.deepEqual(row(),saved);
console.log('PASS management own-customer editing from company view; other-owner, read-only sales and followup writes remain denied, with original data and history preserved.');

await post({...payload(),next_date:'2026-11-09',profile:{nextAction:'核实需求与预算',blocker:'预算未确定',followNote:'等待投资人确认',reviewStatus:'需要协助'}},ownManager);
assert.equal(customerProfile(row()).blocker,'预算未确定');assert.equal(customerProfile(row()).followNote,'等待投资人确认');assert.equal(customerProfile(row()).reviewStatus,'需要协助');
assert.equal(notes(),notesBefore);assert.equal(row().last_contact,'2026-10-02T01:00:00.000Z');
await assert.rejects(()=>post({...payload(),profile:{reviewStatus:'随便'}},ownManager),/核查状态/);
const snapshot=payload();await post({...payload(),profile:{blocker:'',followNote:''}},ownManager);assert.equal(customerProfile(row()).blocker,'');assert.equal(customerProfile(row()).followNote,'');assert.equal(customerProfile(row()).nextAction,'核实需求与预算');await assert.rejects(()=>post(snapshot,ownManager),e=>e.status===409);
console.log('PASS guided follow-up: manual blockers, notes, review choice and date round-trip; explicit clearing, stale-write rejection and contact-history preservation.');

// Authorized maintainers can supplement contract information and correct customer source directly.
const {customerSource,customerSourceSQL}=await import(moduleURL('lib/customer-source.ts'));
const sourceSnapshot=payload();await post({...payload(),customer_source:'微信',profile:{contractNumber:'YF-TEST-001'}},ownManager);
assert.equal(row().source,'微信');assert.equal(customerSource(row()),'微信');assert.equal(customerContractNumber(row()),'YF-TEST-001');assert.equal(row().owner_id,'manager');
assert.deepEqual(JSON.parse(row().detail)._workbench,originalDetail._workbench);assert.deepEqual(JSON.parse(row().detail)._sales_progress,originalDetail._sales_progress);
await assert.rejects(()=>post(sourceSnapshot,ownManager),e=>e.status===409);
const sourceSaved=row();await assert.rejects(()=>post({...payload(),customer_source:'未知渠道'},ownManager),/客户来源/);assert.deepEqual(row(),sourceSaved);
await post({...payload(),customer_source:'Facebook'},ownManager);assert.equal(customerSource(row()),'Facebook');assert.equal(sql.prepare('SELECT '+customerSourceSQL()+" label FROM crm_leads WHERE id='lead'").get().label,'Facebook');
assert.equal(JSON.parse(row().detail).platform,'ig','original imported platform is retained as evidence');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_deals').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_receipts').get().n,0);assert.equal(notes(),notesBefore);
console.log('PASS: own-customer contract supplementation and explicit source corrections without administrator approval; original evidence, ownership and financial records preserved; source SQL/display parity and stale/invalid-source rejection.');
