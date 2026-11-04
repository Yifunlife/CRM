import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {database,moduleURL} from './test-form-intake.mjs';
const {customerPage}=await import(moduleURL('lib/customer-page.ts'));
const {confirmedAllocationImport:importForm}=await import(moduleURL('lib/allocation-confirmed-import.ts'));
const {customerOwnerEligible}=await import(moduleURL('lib/allocation-intake.ts'));
const {can}=await import(moduleURL('lib/crm.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
for(const [id,role,scopes] of [['ceo','ceo',[]],['fd','followup',['domestic']],['ff','followup',['foreign']],['none','followup',[]],['sales','sales',['domestic','foreign']]])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,trade_scopes,created) VALUES(?,?,?,?,?,?,?)').run(id,id,id,role,'unused',JSON.stringify(scopes),'2026-01-01');
const db=database(sql),ceo={id:'ceo',role:'ceo'};
assert(customerOwnerEligible({role:'followup',trade_scopes:'["domestic"]'},'内贸'));assert(!customerOwnerEligible({role:'followup',trade_scopes:'["domestic"]'},'外贸'));assert(customerOwnerEligible({role:'followup',trade_scopes:'["foreign"]'},'外贸'));assert(!customerOwnerEligible({role:'followup',trade_scopes:'[]'}));assert.equal(can({role:'followup',trade_scopes:'["domestic"]'},'customers_all'),false,'selection does not broaden followup permissions');
const body={confirmed_flow:true,allocation_management:true,allocate:false,form_source:'domestic',rows:[{'客户名称':'','联系方式':'13800000101','分配业务员':'fd','来源平台':'抖音'},{'客户名称':'','联系方式':'13800000102','分配业务员':'ff','来源平台':'抖音'},{'客户名称':'','联系方式':'','分配业务员':'fd','来源平台':'抖音'}]};
let r=await importForm(db,ceo,ceo,{...body,preview:true});assert.equal(r.inserted,1);assert.equal(r.reviewed,2);assert(r.previewRows.every(row=>row.name==='暂无'));assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_leads').get().n,0);
r=await importForm(db,ceo,ceo,body);assert.equal(r.inserted,1);const lead=sql.prepare('SELECT * FROM crm_leads').get();assert.equal(lead.name,'暂无');assert.equal(lead.owner_id,'fd');
r=await importForm(db,ceo,ceo,{...body,form_source:'whatsapp',rows:[{'客户名称':'','联系方式':'12025550102','分配业务员':'ff'}]});assert.equal(r.inserted,1);assert.equal(sql.prepare("SELECT name FROM crm_leads WHERE owner_id='ff'").get().name,'暂无');
const page=await customerPage(db,ceo,new URL('https://fixture.invalid/?'+new URLSearchParams({owner_id:'fd',market:'内贸'})));assert.equal(page.total,2);const pending=page.rows.find(row=>row.intake);assert.equal(pending.name,'暂无');assert.equal(pending.owner_pending,true);assert.equal(pending.owner_id,'fd');assert.equal(pending.stage,'待核查');
assert.equal(sql.prepare("SELECT role FROM crm_users WHERE id='fd'").get().role,'followup');assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n,0);
// Multiple unnamed customers with different phones are never merged by the placeholder.
r=await importForm(db,ceo,ceo,{...body,rows:[{'联系方式':'13800000103','录入日期':'2026-11-01'}]});assert.equal(r.inserted,1);assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_leads WHERE name='暂无'").get().n,3);
// The user-confirmed source-sheet alias preserves its raw label and resolves one active account.
sql.prepare("INSERT INTO crm_users(id,username,name,role,password,trade_scopes,created) VALUES('fang','fang','方星球','ceo','unused','[\"domestic\",\"foreign\"]','2026-01-01')").run();
r=await importForm(db,ceo,ceo,{...body,rows:[{'联系方式':'13800000104','分配业务员':'方总'},{'分配业务员':'方总'}]});assert.equal(r.inserted,1);assert.equal(r.reviewed,1);
const fang=sql.prepare("SELECT owner_id,detail FROM crm_leads WHERE phone='13800000104'").get();assert.equal(fang.owner_id,'fang');assert.equal(JSON.parse(fang.detail)['分配业务员'],'方总');
const fangPage=await customerPage(db,ceo,new URL('https://fixture.invalid/?owner_id=fang&market='+encodeURIComponent('内贸')));assert.equal(fangPage.total,2);assert(fangPage.rows.some(row=>row.intake&&row.owner_pending&&row.owner_id==='fang'));
assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
console.log('PASS: followup owners in both scoped markets, preserved roles/permissions, original-owner filtering for pending rows without assigning them, 暂无 names and unique-phone identity, no-write preview and no allocation.');
