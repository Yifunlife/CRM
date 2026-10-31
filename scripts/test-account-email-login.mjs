import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {database,moduleURL} from './test-form-intake.mjs';
const tmp=mkdtempSync(tmpdir()+'/crm-email-login-');
try{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 const {digest,passwordHash}=await import(moduleURL('lib/crm.ts'));
 const password='fixture-password-only';
 for(const role of ['admin','ceo','management','sales','followup','operations']){
  sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(role,role,role,role,await passwordHash(password),'2026-10-31');
  sql.prepare('INSERT INTO crm_sessions VALUES(?,?,?)').run(await digest('test-'+role),role,Date.now()+3600000);
 }
 sql.exec("INSERT INTO crm_leads(id,name,source,owner_id,detail,fingerprint,created) VALUES('lead','customer','Meta','sales','{}','lead','2026-10-31')");
 const before=sql.prepare('SELECT id,username,name,role,password,permissions,active,trade_scopes FROM crm_users ORDER BY id').all(),leads=sql.prepare('SELECT * FROM crm_leads').all();
 globalThis.__emailTestEnv={DB:database(sql)};
 await build({entryPoints:['app/api/[...path]/route.ts'],bundle:true,platform:'node',format:'esm',outfile:tmp+'/route.mjs',plugins:[{name:'isolated-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__emailTestEnv;'}));}}],logLevel:'silent'});
 const handlers=await import(tmp+'/route.mjs'),origin='https://isolated.invalid';
 async function request(path,body,role='admin',expected=200,method=body===undefined?'GET':'POST',view='boss'){
  const response=await handlers[method](new Request(origin+'/api/'+path,{method,headers:{origin,cookie:'crm_session=test-'+role,'Content-Type':'application/json','X-CRM-View':view},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  const data=await response.json();assert.equal(response.status,expected,path+' '+JSON.stringify(data));return {data,response};
 }
 for(const role of ['admin','ceo','management','sales','followup','operations']){
  await request('profile',{email:'  '+role.toUpperCase()+'@Example.Test  '},role);
  assert.equal((await request('me',undefined,role)).data.email,role+'@example.test');
  for(const identifier of [role,role+'@example.test',' '+role.toUpperCase()+'@EXAMPLE.TEST ']){
   const {response}=await request('login',{username:identifier,password},role);assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  }
 }
 for(const email of ['',null,'bad','a@b','a@b@c.test','a b@example.test'])await request('profile',{email},'sales',400);
 await request('profile',{email:'CEO@EXAMPLE.TEST'},'sales',400);
 await request('profile',{email:'other@example.test',id:'ceo'},'sales',400);
 await request('profile',{email:'other@example.test',role:'admin'},'sales',400);
 sql.exec("UPDATE crm_users SET username='winnie' WHERE id='sales'");
 await request('profile',{email:'other@example.test'},'admin',403,'POST','winnie');
 sql.exec("UPDATE crm_users SET username='sales' WHERE id='sales'");
 await request('users',{id:'sales',name:'sales',username:'sales'},'admin',400,'PATCH');
 await request('users',{id:'sales',name:'sales',username:'sales',email:'new-sales@example.test'},'admin',200,'PATCH');
 await request('login',{username:'sales@example.test',password},'sales',401);
 await request('login',{username:'NEW-SALES@EXAMPLE.TEST',password},'sales');
 await request('login',{username:'sales',password},'sales');
 sql.exec("UPDATE crm_users SET active=0 WHERE id='operations'");
 await request('login',{username:'operations@example.test',password},'operations',401);
 sql.exec("UPDATE crm_users SET active=1 WHERE id='operations'");
 for(let i=0;i<5;i++)await request('login',{username:i%2?'management':'management@example.test',password:'wrong'},'management',401);
 await request('login',{username:'management',password},'management',429);
 await request('login',{username:'management@example.test',password},'management',429);
 assert.deepEqual(sql.prepare('SELECT id,username,name,role,password,permissions,active,trade_scopes FROM crm_users ORDER BY id').all(),before);
 assert.deepEqual(sql.prepare('SELECT * FROM crm_leads').all(),leads);
 assert.throws(()=>sql.prepare("UPDATE crm_users SET email='CEO@EXAMPLE.TEST' WHERE id='sales'").run(),/UNIQUE/);
 sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created,email) VALUES(?,?,?,?,?,?,?)').run('employee','yw123','employee','sales',await passwordHash('YW123'),'2026-10-31','employee@example.test');
 await request('login',{username:'employee@example.test',password:'YW123'});
 assert.equal(sql.prepare("SELECT must_change_password FROM crm_users WHERE id='employee'").get().must_change_password,1);
 console.log('PASS: username/email login, case and whitespace normalization, required/unique email, own-profile isolation across all roles, administrator editing, inactive accounts, shared alias rate limit, unchanged passwords/roles/scopes/customer ownership.');
}finally{rmSync(tmp,{recursive:true,force:true});}
