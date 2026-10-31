import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {database,moduleURL} from './test-form-intake.mjs';
const tmp=mkdtempSync(tmpdir()+'/crm-account-classification-');
try{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 const migrations=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
 for(const f of migrations.filter(f=>!f.startsWith('0032_')))sql.exec(readFileSync('drizzle/'+f,'utf8'));
 const {digest,can,PERMISSION_FIELDS}=await import(moduleURL('lib/crm.ts'));
 for(const role of ['admin','ceo','management','sales','followup','operations']){
  sql.prepare('INSERT INTO crm_users(id,username,name,role,password,permissions,created) VALUES(?,?,?,?,?,?,?)').run(role,role,role,role,'test-only','{}','2026-10-30');
  sql.prepare('INSERT INTO crm_sessions VALUES(?,?,?)').run(await digest('test-'+role),role,Date.now()+3600000);
 }
 sql.exec("INSERT INTO crm_leads(id,name,source,owner_id,detail,fingerprint,created) VALUES('lead','customer','Meta','sales','{}','lead','2026-10-30')");
 const usersBefore=sql.prepare('SELECT * FROM crm_users ORDER BY id').all(),leadBefore=sql.prepare('SELECT * FROM crm_leads').all();
 sql.exec(readFileSync('drizzle/0032_account_trade_scopes.sql','utf8'));
 assert.deepEqual(sql.prepare('SELECT * FROM crm_users ORDER BY id').all().map(({trade_scopes,...u})=>u),usersBefore.map(u=>({...u})));
 globalThis.__accountTestEnv={DB:database(sql)};
 await build({entryPoints:['app/api/[...path]/route.ts'],bundle:true,platform:'node',format:'esm',outfile:tmp+'/route.mjs',plugins:[{name:'isolated-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__accountTestEnv;'}));}}],logLevel:'silent'});
 const handlers=await import(tmp+'/route.mjs'),origin='https://isolated.invalid';
 async function request(path,body,role='admin',expected=200,method=body===undefined?'GET':'PATCH'){
  const response=await handlers[method](new Request(origin+'/api/'+path,{method,headers:{origin,cookie:'crm_session=test-'+role,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;
 }
 const update=scopes=>({id:'sales',name:'sales',username:'sales',email:'sales@example.test',trade_scopes:scopes});
 for(const scopes of [['domestic'],['foreign'],['domestic','foreign'],[]]){
  await request('users',update(scopes));
  const user=(await request('users')).find(u=>u.id==='sales');assert.deepEqual(JSON.parse(user.trade_scopes),scopes);
  const {trade_scopes,email,...actual}=sql.prepare("SELECT * FROM crm_users WHERE id='sales'").get();
  const {email:beforeEmail,...beforeAccount}=usersBefore.find(u=>u.id==='sales');assert.deepEqual(actual,beforeAccount);
  for(const [key] of PERMISSION_FIELDS)assert.equal(can(user,key),can(usersBefore.find(u=>u.id==='sales'),key));
 }
 await request('users',update(['domestic','foreign']));
 await request('users',{id:'sales',name:'sales',username:'sales',email:'sales@example.test'});
 assert.deepEqual(JSON.parse((await request('users')).find(u=>u.id==='sales').trade_scopes),['domestic','foreign']);
 for(const invalid of [['unknown'],['domestic','domestic'],['__proto__'],'domestic',null])await request('users',update(invalid),'admin',400);
 for(const role of ['ceo','management','sales','followup','operations'])await request('users',update(['domestic']),role,403);
 for(const scopes of [['domestic'],['foreign'],['domestic','foreign'],[]]){
  await request('users',{id:'management',name:'management',username:'management',trade_scopes:scopes});
  const user=(await request('users')).find(u=>u.id==='management');assert.deepEqual(JSON.parse(user.trade_scopes),scopes);
  const {trade_scopes,...actual}=sql.prepare("SELECT * FROM crm_users WHERE id='management'").get();
  assert.deepEqual(actual,{...usersBefore.find(u=>u.id==='management'),email:''});
  for(const [key] of PERMISSION_FIELDS)assert.equal(can(user,key),can(usersBefore.find(u=>u.id==='management'),key));
 }
 await request('users',{username:'new-manager',name:'new-manager',role:'management',password:'test-only-password',trade_scopes:['domestic','foreign']},'admin',200,'POST');
 assert.deepEqual(JSON.parse((await request('users')).find(u=>u.username==='new-manager').trade_scopes),['domestic','foreign']);
 await request('users',{id:'ceo',name:'ceo',username:'ceo',trade_scopes:['domestic']},'admin',400);
 await request('users',{...update([]),permissions:{}},'admin',400);
 await request('users',{username:'new-sales',name:'new-sales',role:'sales',password:'test-only-password',trade_scopes:['domestic','foreign']},'admin',200,'POST');
 assert.deepEqual(JSON.parse((await request('users')).find(u=>u.username==='new-sales').trade_scopes),['domestic','foreign']);
 await request('users',{id:'sales',active:0});assert.equal((await request('users')).find(u=>u.id==='sales').active,0);
 await request('users',{id:'sales',active:1});
 assert.deepEqual(sql.prepare('SELECT * FROM crm_leads').all(),leadBefore);
 const {accountList}=await import(moduleURL('lib/account-classification.ts'));
 const fixture=usersBefore.map(u=>({...u,active:1})).reverse().concat({...usersBefore[0],id:'disabled',active:0});
 assert.deepEqual(accountList(fixture,'1','','').map(u=>u.role),['admin','ceo','management','sales','followup','operations']);
 assert.deepEqual(accountList(fixture,'0','','').map(u=>u.id),['disabled']);
 assert.equal(accountList(fixture,'1','sales',' SALES ').length,1);
 assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 console.log('PASS: additive migration preserves accounts; independent trade choices persist on create/edit/read; permissions, credentials and owners remain unchanged; unauthorized/invalid writes denied; active/inactive pages and role sorting work.');
}finally{rmSync(tmp,{recursive:true,force:true});}
