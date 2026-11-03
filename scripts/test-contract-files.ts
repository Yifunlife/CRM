import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {contractFiles} from '../lib/contract-files';
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
function stmt(query:string,args:any[]=[]):any{return {bind:(...v:any[])=>stmt(query,v),async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}};}
const db:any={prepare:(q:string)=>stmt(q)};
const users:any={sales:{id:'sales',role:'sales'},other:{id:'other',role:'sales'},admin:{id:'admin',role:'admin'},ceo:{id:'ceo',role:'ceo'}};
for(const u of Object.values(users)as any[])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-10-30');
for(const [id,owner]of [['lead','sales'],['foreign','other']])sql.prepare("INSERT INTO crm_leads(id,name,phone,source,owner_id,detail,fingerprint,created) VALUES(?,?,?,'Meta',?,'{}',?,'2026-10-30')").run(id,id,'13800000000',owner,id);
for(const [id,lead]of [['project','lead'],['wrong','foreign']])sql.prepare("INSERT INTO crm_sales_projects(project_id,name,lead_id,stage_at,token,created,created_by,updated,updated_by) VALUES(?,?,?,'2026-10-30','v1','2026-10-30','sales','2026-10-30','sales')").run(id,id,lead);
const objects=new Map<string,Uint8Array>();let hook:(()=>void)|undefined;const bucket:any={async put(key:string,body:any){const bytes=new Uint8Array(await new Response(body).arrayBuffer());objects.set(key,bytes);hook?.();return {size:bytes.length}},async get(key:string){const bytes=objects.get(key);return bytes?{body:bytes,size:bytes.length}:null},async delete(key:string){objects.delete(key)}};
const call=(user:any,path:string,method='GET',body?:string,size=body?.length)=>contractFiles(new Request('https://crm.test/api/'+path,{method,headers:size===undefined?{}:{'content-length':String(size)},body}),db,bucket,user,user);
const upload=(user=users.sales,extra='')=>call(user,'contract-files?lead_id=lead&name='+encodeURIComponent('已签署合同.pdf')+'&contract_no=YF-2026-001&status='+encodeURIComponent('已签署')+'&project_id=project'+extra,'PUT','%PDF-test');
const before=sql.prepare('SELECT * FROM crm_leads ORDER BY id').all();
const first=await (await upload()).json()as any;assert.ok(first.id);assert.equal(first.contract_no,'YF-2026-001');assert.equal(objects.size,1);
const detail=await (await call(users.sales,'contract-files?lead_id=lead')).json()as any;assert.equal(detail.items.length,1);assert.equal(detail.items[0].contract_no,'YF-2026-001');assert.ok(detail.contract_numbers.includes('YF-2026-001'));assert.equal(detail.items[0].status,'已签署');assert.equal(detail.items[0].project_id,'project');assert.ok(!JSON.stringify(detail).includes('object_key'));assert.equal(detail.can_upload,true);
const download=await call(users.sales,'contract-files/'+first.id);assert.equal(await download.text(),'%PDF-test');assert.ok(download.headers.get('content-disposition')!.includes(encodeURIComponent('已签署合同.pdf')));
await assert.rejects(()=>call(users.other,'contract-files/'+first.id),/无权/);await assert.rejects(()=>upload(users.other),/无权/);
await assert.rejects(()=>call(users.sales,'contract-files?lead_id=lead&name=test.exe&contract_no=YF-2026-001&status='+encodeURIComponent('已填写'),'PUT','bad'),/PDF/);
await assert.rejects(()=>call(users.sales,'contract-files?lead_id=lead&name=test.pdf&contract_no=YF-2026-001&status='+encodeURIComponent('已填写')+'&project_id=wrong','PUT','test'),/项目/);
await assert.rejects(()=>call(users.sales,'contract-files?lead_id=lead&name=test.pdf&contract_no=YF-2026-001&status='+encodeURIComponent('已填写'),'PUT','test',101*1024*1024),/100MB/);
const all=await (await call(users.sales,'contract-files/customers')).json()as any;assert.deepEqual(all.items.map((v:any)=>v.id),['lead']);assert.equal((await (await call(users.sales,'contract-files/customers?q=foreign')).json()as any).items.length,0);
const second=await (await upload(users.admin)).json()as any;assert.notEqual(first.id,second.id);assert.equal(objects.size,2);
const count=sql.prepare("SELECT count(*) n FROM crm_sales_events WHERE kind='合同文件归档'").get()as any;
hook=()=>sql.prepare("UPDATE crm_leads SET owner_id='other' WHERE id='lead'").run();await assert.rejects(()=>upload(),/无权|权限/);hook=undefined;sql.prepare("UPDATE crm_leads SET owner_id='sales' WHERE id='lead'").run();assert.equal(objects.size,2);assert.equal((sql.prepare("SELECT count(*) n FROM crm_sales_events WHERE kind='合同文件归档'").get()as any).n,count.n);
hook=()=>sql.prepare("UPDATE crm_sales_projects SET lead_id='foreign' WHERE project_id='project'").run();await assert.rejects(()=>upload(),/已变化/);hook=undefined;sql.prepare("UPDATE crm_sales_projects SET lead_id='lead' WHERE project_id='project'").run();assert.equal(objects.size,2);
assert.deepEqual(sql.prepare('SELECT * FROM crm_leads ORDER BY id').all(),before);assert.equal((sql.prepare('SELECT count(*) n FROM crm_deals').get()as any).n,0);assert.equal((sql.prepare('SELECT count(*) n FROM crm_receipts').get()as any).n,0);
const hidden=await (await call(users.ceo,'contract-files?lead_id=lead')).json()as any;assert.equal(hidden.can_upload,true);assert.equal(hidden.items.length,2);
assert.equal((await upload(users.ceo)).status,200);assert.equal(objects.size,3);
console.log('PASS: upload/download bytes, customer/project association, isolation, role permissions, validation, append preservation, revoked ownership and project races clean storage, no deal/receipt changes.');
const attachment=await (await call(users.sales,'contract-files?lead_id=lead&category=attachment&name=site.dwg','PUT','CAD-example')).json()as any;
assert.equal(objects.size,4);assert.equal(await (await call(users.sales,'contract-files/'+attachment.id)).text(),'CAD-example');
const attachments=await (await call(users.sales,'contract-files?lead_id=lead&category=attachment')).json()as any;assert.equal(attachments.items.length,1);assert.equal(attachments.items[0].name,'site.dwg');
assert.equal((await (await call(users.sales,'contract-files?lead_id=lead')).json()as any).items.length,3,'ordinary attachments do not appear as contracts');
await assert.rejects(()=>call(users.other,'contract-files/'+attachment.id),/无权/);await assert.rejects(()=>call(users.sales,'contract-files?lead_id=lead&category=attachment&name=unsafe.exe','PUT','test'),/支持|PDF/);
assert.deepEqual(sql.prepare('SELECT * FROM crm_leads ORDER BY id').all(),before);assert.equal((sql.prepare('SELECT count(*) n FROM crm_deals').get()as any).n,0);assert.equal((sql.prepare('SELECT count(*) n FROM crm_receipts').get()as any).n,0);
console.log('PASS: customer attachments append independently, support CAD, retain contract listings, authenticate downloads, reject unsupported files and preserve existing business records.');

// Existing customer identifiers are offered without changing the source records.
sql.prepare("UPDATE crm_sales_projects SET details=? WHERE project_id='project'").run(JSON.stringify({contract_no:'PROJECT-001',other:'preserved'}));
sql.prepare("INSERT INTO crm_deals(id,order_number,lead_id,owner_id,business_scope,deal_date,created,created_by) VALUES('deal','DEAL-001','lead','sales','meta_domestic','2026-11-03','2026-11-03','sales')").run();
sql.prepare("INSERT INTO crm_deals(id,order_number,lead_id,owner_id,business_scope,deal_date,cancelled,created,created_by) VALUES('cancelled','CANCELLED-001','lead','sales','meta_domestic','2026-11-03',1,'2026-11-03','sales')").run();
sql.prepare("UPDATE crm_sales_projects SET details=? WHERE project_id='wrong'").run(JSON.stringify({contract_no:'PRIVATE-001'}));
const known=await (await call(users.sales,'contract-files?lead_id=lead')).json()as any;
assert.deepEqual(new Set(known.contract_numbers),new Set(['PROJECT-001','DEAL-001','YF-2026-001']));
assert.equal(known.projects[0].contract_no,'PROJECT-001');
for(const number of ['', '   ', 'x'.repeat(101), 'bad\nnumber'])await assert.rejects(()=>call(users.sales,'contract-files?lead_id=lead&name=test.pdf&status='+encodeURIComponent('已填写')+'&contract_no='+encodeURIComponent(number),'PUT','%PDF-test'),/合同编号/);
const businessBefore={leads:sql.prepare('SELECT * FROM crm_leads').all(),projects:sql.prepare('SELECT * FROM crm_sales_projects').all(),deals:sql.prepare('SELECT * FROM crm_deals').all()};
for(const name of ['existing.doc','existing.docx','existing.pdf']){
 const saved=await (await call(users.sales,'contract-files?lead_id=lead&name='+name+'&status='+encodeURIComponent('已签署')+'&contract_no='+encodeURIComponent('  DEAL-001  '),'PUT','original-bytes')).json()as any;
 assert.equal(saved.contract_no,'DEAL-001');assert.equal(await (await call(users.sales,'contract-files/'+saved.id)).text(),'original-bytes');
}
// Legacy files remain downloadable and readable without a number.
const event=sql.prepare('SELECT payload FROM crm_sales_events WHERE id=?').get(first.id)as any,legacy=JSON.parse(event.payload);delete legacy.contract_no;sql.prepare('UPDATE crm_sales_events SET payload=? WHERE id=?').run(JSON.stringify(legacy),first.id);
assert.equal((await (await call(users.sales,'contract-files?lead_id=lead')).json()as any).items.find((f:any)=>f.id===first.id).contract_no,'');
assert.equal(await (await call(users.sales,'contract-files/'+first.id)).text(),'%PDF-test');
assert.deepEqual({leads:sql.prepare('SELECT * FROM crm_leads').all(),projects:sql.prepare('SELECT * FROM crm_sales_projects').all(),deals:sql.prepare('SELECT * FROM crm_deals').all()},businessBefore);
assert.equal((sql.prepare('SELECT count(*) n FROM crm_receipts').get()as any).n,0);
console.log('PASS: reuse customer deal/project/archive numbers; exclude other customers and cancelled deals; validate and persist contract numbers; Word/PDF bytes preserved; legacy files readable; no source business records rewritten.');
