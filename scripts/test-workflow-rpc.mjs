import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readdirSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
const root=resolve('dist/server'),files=readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.js'));files.splice(files.indexOf('index.js'),1);files.unshift('index.js');
const mf=new Miniflare({workers:[{name:'crm',modules:files.map(f=>({type:'ESModule',path:resolve(root,f)})),modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'crm-test',QUOTE_DB:'quote-test'}},{name:'caller',modules:true,script:`export default {async fetch(req,env){return Response.json(await env.CRM.quotationChanged('q'));}};`,compatibilityDate:'2026-05-15',serviceBindings:{CRM:{name:'crm',entrypoint:'QuoteWorkflow'}}}]});
const schema=new DatabaseSync(':memory:');
try{
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())schema.exec(readFileSync('drizzle/'+f,'utf8'));
 const db=await mf.getD1Database('DB','crm'),q=await mf.getD1Database('QUOTE_DB','crm');
 for(const {sql} of schema.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all())await db.prepare(sql).run();
 await q.prepare('CREATE TABLE quotation_history(id TEXT PRIMARY KEY,contract_no TEXT,project_name TEXT,created_by TEXT,generated_at TEXT,lineage_id TEXT,is_finalized INTEGER,archived_at TEXT,final_amount REAL,final_currency TEXT,confirmed_at TEXT,voided_at TEXT,project_status TEXT,customer_name TEXT,quote_valid_until TEXT,snapshot_json TEXT)').run();
 await q.prepare("INSERT INTO quotation_history VALUES('q','RPC','test','sales','2026-10-30','family',1,NULL,100,'USD','2026-10-30',NULL,'won','test','','{}')").run();
 const caller=await mf.getWorker('caller'),r=await caller.fetch('https://test.invalid');assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,projects:0});
 const crm=await mf.getWorker('crm');assert.equal((await crm.fetch('https://test.invalid/api/confirmations/quotes')).status,401);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM crm_sales_projects').first()).n,0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM crm_followup_orders').first()).n,0);
 console.log('PASS: built private service RPC works; public API stays authenticated; notification cannot create project or order.');
}finally{schema.close();await mf.dispose();}
