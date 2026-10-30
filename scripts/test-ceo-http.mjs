import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {database,moduleURL} from './test-form-intake.mjs';
const tmp=mkdtempSync(tmpdir()+'/crm-ceo-http-');
try {
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 globalThis.__ceoTestEnv={DB:database(sql)};
 const {digest}=await import(moduleURL('lib/crm.ts'));
 for(const role of ['admin','ceo','sales','followup']){
  sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(role,role,role,role,'test-only','2026-10-30');
  sql.prepare('INSERT INTO crm_sessions(token,user_id,expires) VALUES(?,?,?)').run(await digest('test-'+role),role,Date.now()+3600000);
 }
 for(const owner of ['ceo','sales'])sql.prepare("INSERT INTO crm_leads(id,name,source,owner_id,detail,fingerprint,created) VALUES(?,?,'Meta',?,'{}',?,'2026-10-30')").run(owner+'-lead',owner+' customer',owner,owner);
 await build({entryPoints:['app/api/[...path]/route.ts'],bundle:true,platform:'node',format:'esm',outfile:tmp+'/route.mjs',plugins:[{name:'isolated-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__ceoTestEnv;'}));}}],logLevel:'silent'});
 const handlers=await import(tmp+'/route.mjs');
 const origin='https://isolated.invalid';
 async function request(path,body,view='boss',role='ceo',expected=200,method=body===undefined?'GET':'POST'){
  const r=await handlers[method](new Request(origin+'/api/'+path,{method,headers:{origin,cookie:'crm_session=test-'+role,'Content-Type':'application/json','X-CRM-View':view},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  const d=await r.json();assert.equal(r.status,expected,path+' '+JSON.stringify(d));return d;
 }
 assert.equal((await request('me')).role,'ceo');
 assert.equal((await request('me')).can_switch,true);
 assert.equal((await request('leads')).length,2);
 for(const p of ['users','google/status','service/inbox','workflow/report','role-home','sales-suite/report','followup'])await request(p);
 const before=sql.prepare('SELECT total_changes() n').get().n;
 for(const p of ['grade','assign','users/permissions','service/register','service/settings','cloud/settings','confirmations/release/decision','sales-suite/project/create','followup/order/priority'])await request(p,{},'boss','ceo',403);
 assert.equal(sql.prepare('SELECT total_changes() n').get().n,before,'denied writes must not mutate the database');
 const personal=await request('me',undefined,'personal');assert.equal(personal.role,'sales');assert.equal(personal.id,'ceo');
 assert.deepEqual((await request('leads',undefined,'personal')).map(l=>l.id),['ceo-lead']);
 await request('leads/sales-lead',undefined,'personal','ceo',404);
 await request('grade',{id:'sales-lead',grade:'A'},'personal','ceo',404);
 await request('grade',{id:'ceo-lead',grade:'A'},'personal');
 assert.equal(sql.prepare("SELECT grade FROM crm_leads WHERE id='ceo-lead'").get().grade,'A');
 await request('sales-suite/project/create',{lead_id:'ceo-lead',name:'CEO personal project',reason:'Customer request'},'personal');
 for(const p of ['users/permissions','assign','google/config','cloud/settings','confirmations/release/decision'])await request(p,{},'personal','ceo',403);
 await request('me',undefined,'winnie','ceo',403);
 await request('me',undefined,'personal','sales',403);
 await request('me',undefined,'boss','admin');await request('me',undefined,'boss','sales');await request('me',undefined,'boss','followup');
 assert.equal((await request('leads')).length,2);
 assert.equal(sql.prepare("SELECT role FROM crm_users WHERE id='ceo'").get().role,'ceo');
 console.log('PASS: actual HTTP route enforces CEO all-company read-only, own-client sales writes, server-side view validation, and unchanged admin/sales/followup access.');
} finally {rmSync(tmp,{recursive:true,force:true});}
