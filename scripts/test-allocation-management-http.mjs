import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {database,moduleURL} from './test-form-intake.mjs';
const tmp=mkdtempSync(tmpdir()+'/crm-allocation-http-');
try{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 globalThis.__allocationTestEnv={DB:database(sql)};const {digest}=await import(moduleURL('lib/crm.ts'));const {suiteDay}=await import(moduleURL('lib/sales-suite.ts'));
 for(const role of ['admin','ceo','sales','followup','management']){sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(role,role,role,role,'unused','2026-01-01');sql.prepare('INSERT INTO crm_sessions(token,user_id,expires) VALUES(?,?,?)').run(await digest('test-'+role),role,Date.now()+3600000);}
 sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run('b7e34925-ec83-4f4e-ad42-04be344dc82b','allowed','allowed','management','unused','2026-01-01');sql.prepare('INSERT INTO crm_sessions VALUES(?,?,?)').run(await digest('test-privileged'),'b7e34925-ec83-4f4e-ad42-04be344dc82b',Date.now()+3600000);
 sql.prepare("INSERT INTO crm_leads(id,name,source,detail,fingerprint,entered,created) VALUES('lead','test','Meta','{}','lead',?,?)").run(suiteDay(),new Date().toISOString());
 sql.prepare("INSERT INTO crm_allocation_configs VALUES('all',?,'now','admin')").run(JSON.stringify({members:[{user_id:'sales',state:'参与'}],rule:{automatic:false}}));
 await build({entryPoints:['app/api/[...path]/route.ts'],bundle:true,platform:'node',format:'esm',outfile:tmp+'/route.mjs',plugins:[{name:'isolated-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__allocationTestEnv;'}));}}],logLevel:'silent'});
 const route=await import(tmp+'/route.mjs'),origin='https://isolated.invalid';
 async function request(path,body,role='privileged',expected=200,headerOrigin=origin){const method=body===undefined?'GET':'POST',r=await route[method](new Request(origin+'/api/'+path,{method,headers:{origin:headerOrigin,cookie:role?'crm_session=test-'+role:'','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));const d=await r.json();assert.equal(r.status,expected,path+' '+JSON.stringify(d));return d;}
 for(const path of ['allocation/management','allocation/management/records']){await request(path,undefined,'',401);await request(path,undefined,'sales',403);await request(path,undefined,'followup',403);await request(path,undefined,'ceo');await request(path,undefined,'management');}
 const body={ids:['lead'],recipients:['sales']};await request('allocation/management/preview',body,'ceo');await request('allocation/management/preview',body,'sales',403);await request('allocation/management/preview',body,'admin',403,'https://other.invalid');
 const preview=await request('allocation/management/preview',body);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n,0);
 const confirmed=await request('allocation/management/confirm',{...body,token:preview.token});assert.equal(confirmed.assigned,1);await request('allocation/management/confirm',{...body,token:preview.token},'privileged',409);
 const board=await request('allocation/management');assert.equal(board.automatic,false);assert.equal(board.summary.today,1);assert.equal(board.total,0);
 const imported=await request('import',{source:'Meta',allocation_management:true,filename:'original.csv',rows:[{客户名称:'original',联系方式:'13800002201',邮箱:'original@example.invalid',分配业务员:'sales',录入日期:suiteDay()},{客户名称:'pending',联系方式:'13800002202',邮箱:'pending@example.invalid',录入日期:suiteDay()}]});assert.equal(imported.inserted,2);assert.equal(imported.autoAssigned,0);assert.equal(sql.prepare("SELECT owner_id FROM crm_leads WHERE name='pending'").get().owner_id,null);assert.equal(sql.prepare("SELECT owner_id FROM crm_leads WHERE name='original'").get().owner_id,'sales');
 const records=await request('allocation/management/records');assert(records.rows.some(r=>r.detail==='full-first-v1'));assert(records.rows.some(r=>r.kind==='表单导入'));
 assert.equal(JSON.parse(sql.prepare("SELECT payload FROM crm_allocation_configs WHERE scope='all'").get().payload).rule.automatic,false);
 console.log('PASS: real API dispatcher, session/role/CEO/origin enforcement, preview without writes, manual confirmation and replay protection, live media stats/records, imported original owner and automatic-off preservation.');
}finally{rmSync(tmp,{recursive:true,force:true});}
