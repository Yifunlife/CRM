import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {database,moduleURL} from './test-form-intake.mjs';
const {confirmedAllocationImport:importForm}=await import(moduleURL('lib/allocation-confirmed-import.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
for(const [id,name,role] of [['ops','Operations','operations'],['winnie','Winnie Wu','management'],['polly','Polly Chai','sales'],['disabled','Former Staff','sales']])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(id,id+'-login',name,role,'unused','2026-01-01');sql.exec("UPDATE crm_users SET active=0 WHERE id='disabled'");
sql.prepare("INSERT INTO crm_leads(id,name,phone,owner_id,source,detail,fingerprint,created) VALUES('existing','Existing','12025550104','polly','WhatsApp／其他','{}','existing','2026-01-01')").run();
const ops={id:'ops',role:'operations'},db=database(sql),body={confirmed_flow:true,allocation_management:true,allocate:false,confirm_allocate:true,form_source:'whatsapp',filename:'owned.csv',rows:[
 {'客户名称':'','联系方式':'+1 202 555 0101','分配业务员':'Winnie','录入日期':'9月8日','项目需求描述':'Original message'},
 {'客户名称':'Example','联系方式':'+1 202 555 0102','分配业务员':'polly','录入日期':'2026-09-08'},
 {'客户名称':'@example_handle','分配业务员':'Winnie','录入日期':'2026-09-08'},
 {'客户名称':'Conflict','联系方式':'+1 202 555 0104','分配业务员':'Winnie'},
 {'客户名称':'Repeat','联系方式':'+1 202 555 0104','分配业务员':'POLLY CHAI'},
 {'客户名称':'Missing owner','联系方式':'+1 202 555 0105','分配业务员':'Not an employee'},
 {'客户名称':'No contact','分配业务员':'Winnie'},
 {'客户名称':'Inactive owner','联系方式':'+1 202 555 0106','分配业务员':'Former Staff'},
 {'客户名称':'Unassigned','联系方式':'+1 202 555 0107','录入日期':'2026-11-03','客资市场':'外贸'}
]};
const snapshot=()=>JSON.stringify(['crm_leads','crm_assignments','crm_batches','crm_customer_pool'].map(t=>sql.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()));let before=snapshot();
const preview=await importForm(db,ops,ops,{...body,preview:true});assert.equal(preview.inserted,4);assert.equal(preview.reviewed,4);assert.equal(preview.skipped,1);assert.equal(snapshot(),before);
assert(preview.previewRows.every(r=>r.market==='外贸'),'WhatsApp source is always foreign trade');assert.equal(preview.previewRows[0].owner_name,'Winnie Wu');assert.equal(preview.previewRows[1].owner_name,'Polly Chai');assert.equal(preview.previewRows[2].kind,'owned');
const result=await importForm(db,ops,ops,body);assert.equal(result.autoAssigned,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n,0,'manual form never creates new allocation counts, even with stale confirm_allocate=true');
const blank=sql.prepare("SELECT * FROM crm_leads WHERE phone='+1 202 555 0101'").get();assert.equal(blank.owner_id,'winnie');assert.equal(blank.name,'+1 202 555 0101');assert.equal(blank.entered,'9月8日');assert.equal(blank.cohort,'unknown');assert.equal(JSON.parse(blank.detail)['客户名称'],'');assert.equal(JSON.parse(blank.detail)['项目需求描述'],'Original message');assert.equal(blank.original_owner,'Winnie Wu');
assert.equal(sql.prepare("SELECT owner_id FROM crm_leads WHERE name='Example'").get().owner_id,'polly');assert.equal(sql.prepare("SELECT owner_id FROM crm_leads WHERE name='@example_handle'").get().owner_id,'winnie');assert.equal(sql.prepare("SELECT owner_id FROM crm_leads WHERE name='Unassigned'").get().owner_id,null);assert.equal(sql.prepare("SELECT owner_id FROM crm_leads WHERE id='existing'").get().owner_id,'polly');assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_customer_pool').get().n,4);
const replay=await importForm(db,ops,ops,body);assert.equal(replay.inserted,0);assert.equal(replay.reviewed,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_leads').get().n,5);
sql.prepare("INSERT INTO crm_leads(id,name,phone,source,detail,fingerprint,created) VALUES('unowned-existing','Existing without owner','12025550109','WhatsApp／其他','{}','unowned-existing','2026-01-01')").run();const restored=await importForm(db,ops,ops,{...body,rows:[{客户名称:'Original file customer',联系方式:'+1 202 555 0109',分配业务员:'Winnie'}]});assert.equal(restored.repeated,1);const restoredLead=sql.prepare("SELECT * FROM crm_leads WHERE id='unowned-existing'").get();assert.equal(restoredLead.owner_id,'winnie');assert.equal(restoredLead.name,'Existing without owner');assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n,0);
const same=await importForm(db,ops,ops,{...body,rows:[{客户名称:'Another enquiry',联系方式:'+1 202 555 0104',分配业务员:'polly'}],preview:true});assert.equal(same.repeated,1,'unique short employee name matches an existing full-name owner without conflict');
sql.prepare("INSERT INTO crm_users(id,username,name,role,password,created) VALUES('polly2','polly2','Polly Other','sales','unused','2026-01-01')").run();const ambiguous=await importForm(db,ops,ops,{...body,rows:[{客户名称:'Ambiguous',联系方式:'+1 202 555 0108',分配业务员:'Polly'}],preview:true});assert.equal(ambiguous.reviewed,1);assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
console.log('PASS: assigned form rows enter CRM under original staff; unique short names resolved; blank names/unknown market/date retained; source handles kept; missing/ambiguous/inactive owners and conflicting existing ownership reviewed; no reallocation or added allocation counts; duplicate replay safe.');
