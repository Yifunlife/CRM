import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const source=readFileSync('lib/database-backup.ts','utf8').replace("import {readJson} from './object-storage';",'const readJson=async text=>JSON.parse(text);');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {databaseBackup,backupTables}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function database(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
 return db;
}
const original=database();
original.exec("INSERT INTO crm_users(id,username,name,role,password,created) VALUES('admin','admin','测试管理员','admin','unused','2026-10-01'); INSERT INTO crm_leads(id,name,source,detail,fingerprint,created,owner_id) VALUES('lead','测试客户','Meta','{}','test-fingerprint','2026-10-01','admin'); INSERT INTO crm_deals(id,order_number,lead_id,owner_id,business_scope,deal_date,created,created_by) VALUES('deal','TEST-001','lead','admin','meta-full','2026-10-01','2026-10-01','admin');");
const insert=original.prepare('INSERT INTO crm_receipts(id,reference,deal_id,amount_minor,currency,received_date,cancelled,created,created_by) VALUES(?,?,?,?,?,?,?,?,?)');
for(let i=0;i<205;i++)insert.run('receipt-'+i,'reference-'+i,'deal',12345+i,i%2?'USD':'CNY','2026-10-02',i%3===0?1:0,'2026-10-02','admin');
original.exec("INSERT INTO crm_customer_pool(id,source,raw,payload,created,updated,created_by,lead_id,state) VALUES('pool','Meta','原始测试资料','{}','2026-10-29','2026-10-29','admin','lead','已入CRM'); INSERT INTO crm_pool_events(id,intake_id,actor_id,kind,payload,created) VALUES('event','pool','admin','确认资料','{}','2026-10-29');");
const rows=(db,table)=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
const tables=original.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'crm_%' ORDER BY name").all().map(r=>r.name);
const transient=new Set(['crm_login_attempts','crm_sessions','crm_google_oauth','crm_cloud_auth']);
assert.deepEqual(tables.filter(t=>!transient.has(t)&&!backupTables.includes(t)),[],'Every persistent CRM table must be included in backups');
original.exec("INSERT INTO crm_cloud_messages(id,owner_id,phone_id,lead_id,peer,direction,content,status,created) VALUES('msg','admin','phone','lead','peer','in','历史聊天测试','received','2026-10-30'); INSERT INTO crm_ai_limits VALUES('admin',1000,'2026-10-30','admin'); INSERT INTO crm_cloud_receipts VALUES('receipt','phone','delivered');");
const before=Object.fromEntries(tables.map(table=>[table,rows(original,table)]));
const reads=[];
const response=databaseBackup({prepare(sql){return {bind(...args){return {async all(){reads.push(sql);return {results:original.prepare(sql).all(...args)};}};}};}});
const entries=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
assert.equal(entries[0].format,'yifun-crm-backup-v1');
const footer=entries.at(-1);
assert.equal(footer.complete,true);
assert.equal(footer.counts.crm_receipts,205,'backup must include every receipt');
assert.deepEqual(entries.filter(e=>e.table==='crm_receipts').map(e=>e.row),JSON.parse(JSON.stringify(before.crm_receipts)));
assert.equal(reads.filter(sql=>sql.includes('FROM crm_receipts ')).length,3,'receipts must cross pagination boundaries');
const restored=database();
for(const {table,row} of entries.slice(1,-1)){
 const keys=Object.keys(row);
 restored.prepare(`INSERT INTO ${table} (${keys.map(k=>'"'+k+'"').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
}
for(const table of backupTables){
 assert.equal(footer.counts[table],before[table].length,table+' count');
 assert.deepEqual(rows(restored,table),before[table],table+' restore');
}
for(const table of tables)assert.deepEqual(rows(original,table),before[table],table+' unchanged');
assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);
assert.equal(restored.prepare('PRAGMA quick_check').get().quick_check,'ok');
original.close();restored.close();
console.log('PASS: 205 receipts across three pages, CNY/USD, cancelled receipts, backup counts, local restore, foreign keys and unchanged source data.');
