import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {build} from 'esbuild';
import {database,moduleURL} from './test-form-intake.mjs';
const dir=mkdtempSync(tmpdir()+'/crm-confirmed-import-http-'),sql=new DatabaseSync(':memory:'),originalLog=console.log;
console.log=()=>{};
try{
 sql.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
 const {digest,can}=await import(moduleURL('lib/crm.ts')),{confirmedImportAllowed}=await import(moduleURL('lib/allocation-confirmed-import.ts'));
 const people=[['b7e34925-ec83-4f4e-ad42-04be344dc82b','management'],['other-manager','management'],['ops','operations'],['ceo','ceo'],['admin','admin'],['sales','sales'],['followup','followup']];
 for(const [id,role] of people){sql.prepare('INSERT INTO crm_users(id,username,name,role,password,permissions,created) VALUES(?,?,?,?,?,?,?)').run(id,id,id,role,'unused',JSON.stringify({customers_edit:false}),'2026-01-01');sql.prepare('INSERT INTO crm_sessions VALUES(?,?,?)').run(await digest('fixture-'+id),id,Date.now()+3600000);}
 assert.equal(can({role:'management'},'customers_edit'),false,'fixture reproduces the management default which blocked import');
 const db=database(sql);globalThis.__confirmedImportHTTPEnv={DB:db};
 await build({entryPoints:['app/api/[...path]/route.ts'],bundle:true,platform:'node',format:'esm',outfile:dir+'/route.mjs',logLevel:'silent',plugins:[{name:'http-fixture',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__confirmedImportHTTPEnv;'}));}}]});
 const handlers=await import(dir+'/route.mjs');
 async function request(id,body,path='import',view='boss',extra={}){const response=await handlers.POST(new Request('https://fixture.invalid/api/'+path,{method:'POST',headers:{origin:'https://fixture.invalid',cookie:'crm_session=fixture-'+id,'Content-Type':'application/json','X-CRM-View':view,...extra},body:JSON.stringify(body)}));return {status:response.status,data:await response.json()};}
 const form={confirmed_flow:true,allocation_management:true,allocate:false,confirm_allocate:false,form_source:'whatsapp',filename:'fixture.csv',preview:true,rows:Array.from({length:124},(_,i)=>({'客户名称':'Example '+i,'联系方式':'+1 202 555 '+String(i).padStart(4,'0'),'录入日期':'2026-09-08','分配业务员':'sales','项目需求描述':'Original message '+i}))};
 const tables=['crm_leads','crm_customer_pool','crm_form_submissions','crm_assignments','crm_batches','crm_users'];const snapshot=()=>JSON.stringify(tables.map(t=>sql.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()));const before=snapshot();
 for(const [id,role] of people.filter(([,role])=>['operations','management','ceo','admin'].includes(role))){for(const source of ['whatsapp','domestic']){const r=await request(id,{...form,form_source:source});assert.equal(r.status,200,id+' '+source+': '+JSON.stringify(r.data));assert.equal(r.data.previewRows.length,124);}}
 assert.equal(snapshot(),before,'all preview requests leave customers, assignments, batches and user permissions unchanged');
 for(const id of ['sales','followup'])assert.equal((await request(id,form)).status,403);
 for(const id of ['other-manager','b7e34925-ec83-4f4e-ad42-04be344dc82b','ceo'])assert.equal((await request(id,form,'import','personal')).status,403,'personal sales view cannot borrow management permission');
 assert.equal((await request('other-manager',{mode:'original'},'allocation/management/policy')).status,403,'import does not grant allocation settings');
 assert.equal((await request('other-manager',{...form,form_source:'forged'})).status,403);
 assert.equal((await request('other-manager',{...form,allocate:true})).status,403);
 assert.equal((await request('other-manager',form,'import','boss',{'X-CRM-Preview':'stale-context'})).status,409,'read-only preview context remains guarded');
 assert.equal(confirmedImportAllowed({id:'ops',role:'operations'},{id:'admin',role:'admin'},form),false);
 assert.equal(confirmedImportAllowed({id:'ops',role:'operations',active:0},{id:'ops',role:'operations'},form),false);
 const imported=await request('other-manager',{...form,preview:false,rows:[{...form.rows[0],'客资市场':'外贸'}]});assert.equal(imported.status,200);assert.equal(imported.data.inserted,1);assert.equal(sql.prepare('SELECT owner_id FROM crm_leads').get().owner_id,'sales');assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n,0);
 const replay=await request('other-manager',{...form,preview:false,rows:[{...form.rows[0],'客资市场':'外贸'}]});assert.equal(replay.data.skipped,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_leads').get().n,1);assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 originalLog('PASS: actual HTTP route permits operations, every management account, CEO and admin for both forms; 124-row previews write nothing; historical import/replay retains ownership; sales, personal view, forged flow, inactive/mismatched actors and read-only context stay blocked; no new allocation-settings permission.');
}finally{console.log=originalLog;delete globalThis.__confirmedImportHTTPEnv;sql.close();rmSync(dir,{recursive:true,force:true});}
