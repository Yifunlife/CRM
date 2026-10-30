import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readdirSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
// Exercise the built scheduled export directly: the local assets proxy has no scheduled handler.
const root=resolve('dist/server'),files=readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.js'));
files.splice(files.indexOf('index.js'),1);files.unshift('index.js');
const mf=new Miniflare({name:'phase1-scheduled-test',modules:files.map(f=>({type:'ESModule',path:resolve(root,f)})),modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'scheduled-fixture'}});
const schema=new DatabaseSync(':memory:');
try{
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())schema.exec(readFileSync('drizzle/'+file,'utf8'));
 const db=await mf.getD1Database('DB');
 // Use a fresh, empty schema; never depend on a developer's persisted D1 or customers.
 for(const {sql} of schema.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all())await db.prepare(sql).run();
 const worker=await mf.getWorker();assert.equal((await worker.scheduled({cron:'*/5 * * * *'})).outcome,'ok');
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM crm_leads').first()).n,0);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM crm_contract_confirmations').first()).n,0);
 console.log('PASS: built Worker scheduled handler executes against an isolated current schema, without an open CRM page or creating customers/contracts.');
}finally{schema.close();await mf.dispose();}
