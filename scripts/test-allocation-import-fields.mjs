import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {allocationImportMapping,allocationImportRows}=await import(moduleURL('lib/allocation-import-fields.ts'));
const {confirmedAllocationImport}=await import(moduleURL('lib/allocation-confirmed-import.ts'));
const headers=['日期','电话','用户名','分配业务员','留言详情'];
const grid={name:'Sheet1',headers,rows:[['2026-09-08','+1 (202) 555-0101','Example Customer','Winnie','Hello, 2000 sqm project.\nPlease send details.'],['9月8日','+1 (202) 555-0102','','Winnie','Hi'],['2026-09-07','','@example','Winnie','Catalogue please']]};
const mapping=allocationImportMapping(headers),rows=allocationImportRows(grid,mapping);
assert.equal(mapping['客户名称'],'用户名');assert.equal(mapping['录入日期'],'日期');assert.equal(mapping['项目需求描述'],'留言详情');
for(let i=0;i<grid.rows.length;i++){assert.equal(rows[i]['客户名称'],grid.rows[i][2]);assert.equal(rows[i]['联系方式'],grid.rows[i][1]);assert.equal(rows[i]['分配业务员'],grid.rows[i][3]);assert.equal(rows[i]['项目需求描述'],grid.rows[i][4]);assert.equal(rows[i]['录入日期'],grid.rows[i][0]);assert.equal(rows[i]['留言详情'],grid.rows[i][4]);}
assert.equal(allocationImportRows(grid,{...mapping,'客户名称':'电话'})[0]['客户名称'],grid.rows[0][1],'manual mapping remains authoritative');
assert.equal(allocationImportMapping([' 客户名称 ','用户名'])['客户名称'],' 客户名称 ','canonical header takes priority');
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
for(const [id,name,role] of [['ops','Operations','operations'],['winnie','Winnie','sales']])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(id,id,name,role,'unused','2026-01-01');
const db=database(sql),ops={id:'ops',role:'operations'},body={confirmed_flow:true,allocation_management:true,allocate:false,confirm_allocate:false,form_source:'whatsapp',rows};
let preview=await confirmedAllocationImport(db,ops,ops,{...body,preview:true});
assert.equal(preview.inserted,2,'assigned phone-bearing rows keep original owners despite missing market, name or year');assert.equal(preview.reviewed,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_batches').get().n,0);
assert.equal(preview.previewRows[0].name,'Example Customer');assert.equal(preview.previewRows[0].entered,'2026-09-08');assert.equal(preview.previewRows[0].owner_name,'Winnie');assert.equal(preview.previewRows[0].requirement,grid.rows[0][4]);
for(const day of ['9/8','9月8日']){const checked=await confirmedAllocationImport(db,ops,ops,{...body,rows:[{...rows[0],'客资市场':'外贸','录入日期':day}],preview:true});assert.equal(checked.previewRows[0].kind,'owned','assigned rows retain month/day without an inferred year');assert.equal(checked.previewRows[0].entered,day);}
const historical={...rows[0],'客资市场':'外贸'};preview=await confirmedAllocationImport(db,ops,ops,{...body,rows:[historical],preview:true});assert.equal(preview.previewRows[0].kind,'owned');
await confirmedAllocationImport(db,ops,ops,{...body,rows:[historical]});const saved=sql.prepare('SELECT * FROM crm_leads').get();assert.equal(saved.owner_id,'winnie');assert.equal(saved.entered,'2026-09-08');assert.equal(JSON.parse(saved.detail)['留言详情'],grid.rows[0][4]);assert.equal(JSON.parse(saved.detail)['项目需求描述'],grid.rows[0][4]);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n,0);
assert.equal((await confirmedAllocationImport(db,ops,ops,{...body,rows:[historical]})).skipped,1);
await confirmedAllocationImport(db,ops,ops,{...body,rows:rows.slice(1)});assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_customer_pool').get().n,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_leads').get().n,2);assert.equal(sql.prepare("SELECT entered FROM crm_leads WHERE phone='+1 (202) 555-0102'").get().entered,'9月8日');assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
console.log('PASS: WhatsApp five-column mapping and manual override, blank source names/contact handles preserved with original staff, zero-write preview, no reallocation and safe duplicate replay.');
