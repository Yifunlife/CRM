import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'operations-api-'));
try{
 await build({entryPoints:['lib/attribution-server.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'server.mjs'),logLevel:'silent'});
 const {attributionEndpoint}=await import('file://'+join(dir,'server.mjs'));
 const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 class Statement{constructor(s,args=[]){this.sql=s;this.args=args;}bind(...args){return new Statement(this.sql,args);}async all(){return {results:sql.prepare(this.sql).all(...this.args)};}async first(){return sql.prepare(this.sql).get(...this.args);}}
 const db={prepare:s=>new Statement(s)};
 const admin={id:'admin',role:'admin'},sales={id:'sales',role:'sales'};
 sql.exec("INSERT INTO crm_users(id,username,name,role,password,created) VALUES('admin','a','admin','admin','unused','now'),('sales','s','sales','sales','unused','now'); INSERT INTO crm_leads(id,name,source,business_scope,country,owner_id,detail,fingerprint,created,entered) VALUES('l','示例','阿里','alibaba','中国','sales','{}','test','2026-10-02T00:00:00Z','2026-10-02');");
 const url=new URL('http://local/api/attribution/report?from=2026-10-01&to=2026-10-29');
 const result=await attributionEndpoint(db,admin,admin,'attribution/report','GET',null,url);
 assert.equal(result.dashboard.sections.find(s=>s.market==='外贸').total,1);
 const own=await attributionEndpoint(db,sales,sales,'attribution/report','GET',null,url);
 assert.equal(own.dashboard,null);assert.equal(own.operations,null);
 await assert.rejects(()=>attributionEndpoint(db,admin,admin,'attribution/report','GET',null,new URL('http://local/?from=2026-11-01&to=2026-10-01')));
 console.log('PASS: real migrated SQLite report endpoint, Alibaba market, manager visibility, sales isolation and invalid period.');
}finally{rmSync(dir,{recursive:true,force:true});}
