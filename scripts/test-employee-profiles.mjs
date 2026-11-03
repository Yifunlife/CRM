import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {database,moduleURL} from './test-form-intake.mjs';
const dir=mkdtempSync(tmpdir()+'/crm-employee-profiles-'),sql=new DatabaseSync(':memory:');
const originalLog=console.log;console.log=()=>{};
try{
 sql.exec('PRAGMA foreign_keys=ON');
 const migrations=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
 for(const file of migrations.filter(f=>f!=='0038_employee_contacts.sql'))sql.exec(readFileSync('drizzle/'+file,'utf8'));
 const {digest}=await import(moduleURL('lib/crm.ts'));
 for(const role of ['admin','ceo','management','sales','followup','operations']){
  sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(role,role,role,role,'unchanged','2026-11-03');
  sql.prepare('INSERT INTO crm_sessions VALUES(?,?,?)').run(await digest('test-'+role),role,Date.now()+3600000);
 }
 sql.exec("INSERT INTO crm_leads(id,name,source,owner_id,detail,fingerprint,created) VALUES('customer','Customer','Meta','sales','{}','customer','2026-11-03')");
 const before=sql.prepare('SELECT * FROM crm_users ORDER BY id').all(),leads=sql.prepare('SELECT * FROM crm_leads').all();
 sql.exec(readFileSync('drizzle/0038_employee_contacts.sql','utf8'));
 assert.deepEqual(sql.prepare('SELECT * FROM crm_users ORDER BY id').all().map(({whatsapp,wechat,...row})=>row),before.map(u=>({...u})));
 assert(sql.prepare('SELECT * FROM crm_users').all().every(u=>u.whatsapp===''&&u.wechat===''));
 globalThis.__employeeProfilesEnv={DB:database(sql)};
 await build({entryPoints:['app/api/[...path]/route.ts'],bundle:true,platform:'node',format:'esm',outfile:dir+'/route.mjs',logLevel:'silent',plugins:[{name:'isolated-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__employeeProfilesEnv;'}));}}]});
 const handlers=await import(dir+'/route.mjs');
 async function request(path,body,role='admin',expected=200,method=body===undefined?'GET':'POST'){
  const response=await handlers[method](new Request('https://fixture.invalid/api/'+path,{method,headers:{origin:'https://fixture.invalid',cookie:'crm_session=test-'+role,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  const result=await response.json();assert.equal(response.status,expected,path+' '+JSON.stringify(result));return result;
 }
 const update={id:'sales',name:'sales',username:'sales',email:'sales@example.test',whatsapp:'+61 (412) 345-678',wechat:'sales_wechat'};
 await request('users',update,'admin',200,'PATCH');
 let person=(await request('users')).find(u=>u.id==='sales');assert.equal(person.whatsapp,'+61412345678');assert.equal(person.wechat,'sales_wechat');
 for(const role of ['management','sales','followup','operations'])await request('users',update,role,403,'PATCH');
 await request('users',{...update,id:'admin',name:'admin',username:'admin'},'ceo',403,'PATCH');
 await request('users',{...update,email:'changed@example.test'},'ceo',200,'PATCH');
 for(const role of ['admin','ceo','management','sales','followup','operations']){
  await request('profile',{email:role+'@example.test',whatsapp:'+86 138 0013 8000',wechat:role+'_wechat'},role);
  const me=await request('me',undefined,role);assert.equal(me.whatsapp,'+8613800138000');assert.equal(me.wechat,role+'_wechat');
 }
 const saved=sql.prepare("SELECT * FROM crm_users WHERE id='sales'").get();
 for(const whatsapp of [null,123,'12345678','+01 234 5678','+61abc12345678','+123456','+1234567890123456','+61\n412345678'])await request('profile',{email:'sales@example.test',whatsapp},'sales',400);
 for(const wechat of [null,123,'a b','a\nb','x'.repeat(81)])await request('profile',{email:'sales@example.test',wechat},'sales',400);
 await request('profile',{email:'ceo@example.test',whatsapp:'',wechat:''},'sales',400);
 await request('profile',{email:'sales@example.test',whatsapp:'',wechat:'',id:'ceo'},'sales',400);
 assert.deepEqual(sql.prepare("SELECT * FROM crm_users WHERE id='sales'").get(),saved,'invalid updates are atomic');
 await request('profile',{email:'sales@example.test'},'sales');
 await request('users',{id:'sales',name:'sales',username:'sales'},'admin',200,'PATCH');
 assert.deepEqual(sql.prepare("SELECT * FROM crm_users WHERE id='sales'").get(),saved,'old clients preserve contacts');
 await request('profile',{email:'sales@example.test',whatsapp:'',wechat:''},'sales');
 assert.equal((await request('me',undefined,'sales')).whatsapp,'');
 await request('users',{username:'new-employee',name:'New employee',role:'sales',password:'fixture-password',email:'new@example.test',whatsapp:'+1 202 555 0123',wechat:'new_wechat',trade_scopes:['domestic']});
 person=(await request('users')).find(u=>u.username==='new-employee');assert.equal(person.whatsapp,'+12025550123');assert.equal(person.wechat,'new_wechat');
 assert.deepEqual(sql.prepare('SELECT * FROM crm_users WHERE id<>? ORDER BY id').all(person.id).map(({email,whatsapp,wechat,...u})=>u),before.map(({email,...u})=>u));
 assert.deepEqual(sql.prepare('SELECT * FROM crm_leads').all(),leads);assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 originalLog('PASS: additive migration; employee create/edit/read; own-profile access for every role; CEO protections; contact validation and clearing; invalid writes are atomic; old clients preserve contacts; unchanged passwords, permissions, scopes and customer ownership.');
}finally{console.log=originalLog;delete globalThis.__employeeProfilesEnv;sql.close();rmSync(dir,{recursive:true,force:true});}
