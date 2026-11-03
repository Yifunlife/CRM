import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {database,moduleURL} from './test-form-intake.mjs';
const dir=mkdtempSync(tmpdir()+'/crm-management-personal-'),sql=new DatabaseSync(':memory:');
try{
 sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 const {digest}=await import(moduleURL('lib/crm.ts'));
 const identities=[['admin','admin',[]],['ceo','ceo',['domestic','foreign']],['manager','management',['foreign']],['manager-empty','management',['domestic']],['other','sales',['foreign']],['follower','followup',[]]];
 for(const [id,role,scopes] of identities){sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created,trade_scopes) VALUES(?,?,?,?,?,?,?)').run(id,id,id,role,'fixture','2026-11-03',JSON.stringify(scopes));sql.prepare('INSERT INTO crm_sessions(token,user_id,expires) VALUES(?,?,?)').run(await digest('test-'+id),id,Date.now()+3600000);}
 for(const owner of ['ceo','manager','other']){
  sql.prepare("INSERT INTO crm_leads(id,name,owner_id,country,source,detail,fingerprint,created) VALUES(?,?,?,'US','Meta','{}',?,'2026-11-03')").run(owner+'-lead',owner,owner,owner);
  sql.prepare("INSERT INTO crm_followup_orders(id,order_number,project,lead_id,commercial_id,logistics_id,details,steps,change_token,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,'follower','{}','[]',?,'2026-11-03','admin','2026-11-03','admin')").run(owner+'-order',owner+'-number',owner,owner+'-lead',owner,owner+'-token');
 }
 globalThis.__managementPersonalEnv={DB:database(sql)};
 await build({entryPoints:['app/api/[...path]/route.ts'],bundle:true,platform:'node',format:'esm',outfile:dir+'/route.mjs',logLevel:'silent',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__managementPersonalEnv;'}));}}]});
 const handlers=await import(dir+'/route.mjs');let requests=0;
 async function request(actor,path,{view='boss',status=200,body,cookie=''}={}){
  requests++;const method=body===undefined?'GET':'POST',r=await handlers[method](new Request('https://fixture.invalid/api/'+path,{method,headers:{origin:'https://fixture.invalid',cookie:'crm_session=test-'+actor+(cookie?'; '+cookie:''),'Content-Type':'application/json','X-CRM-View':view},...(body===undefined?{}:{body:JSON.stringify(body)})}));const d=await r.json();assert.equal(r.status,status,actor+' '+view+' '+path+' '+JSON.stringify(d));return {data:d,response:r};
 }
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_workbench_snapshots').get().n,0);
 const before=sql.prepare('SELECT total_changes() n').get().n;
 for(const actor of ['ceo','manager','manager-empty']){
  const company=(await request(actor,'me')).data;assert.equal(company.can_switch,true);assert.equal(company.role,actor==='ceo'?'ceo':'management');
  const me=(await request(actor,'me',{view:'personal'})).data;assert.equal(me.id,actor);assert.equal(me.role,'sales');assert.equal(me.personal_business,true);assert.equal(me.can_switch,true);assert.equal(me.capabilities.customers_all,false);assert.equal(me.capabilities.followup_all,false);assert.equal(me.capabilities.leads_allocate,false);
  assert.deepEqual((await request(actor,'leads',{view:'personal'})).data.map(l=>l.id),actor==='manager-empty'?[]:[actor+'-lead']);
  await request(actor,'leads/other-lead',{view:'personal',status:404});
  assert.deepEqual((await request(actor,'followup',{view:'personal'})).data.orders.map(o=>o.id),actor==='manager-empty'?[]:[actor+'-order']);
  await request(actor,'followup/orders/other-order',{view:'personal',status:404});
  await request(actor,'followup-phase1/orders/other-order/records',{view:'personal',status:404});
  if(actor!=='manager-empty')await request(actor,'followup/orders/'+actor+'-order',{view:'personal'});
  for(const path of ['users/permissions','assign','followup/import'])await request(actor,path,{view:'personal',body:{},status:403});
 }
 assert.equal(sql.prepare('SELECT total_changes() n').get().n,before,'switching and denied operations do not persist business changes');
 await request('manager','followup/orders/other-order');
 await request('manager','grade',{view:'personal',body:{id:'manager-lead',grade:'A'}});
 assert.equal((await request('manager','leads/manager-lead')).data.grade,'A','company view reads the same updated customer');
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_leads').get().n,3,'no duplicate customer is created');
 const owned=(await request('manager','leads/manager-lead')).data;
 const profileBody={id:owned.id,revision:owned.detail._profile_revision||0,base:Object.fromEntries(['name','country','phone','email','grade','next_date'].map(key=>[key,owned[key]])),country:owned.country,method:'WhatsApp',source_note:'',contacts:[],profile:{city:'Sydney'}};
 await request('manager','role-workspace/customer',{body:profileBody});
 assert.equal((await request('manager','leads/manager-lead')).data.detail._customer_profile.city,'Sydney','company-view own-customer save persists');
 const audit=sql.prepare("SELECT created_by,payload FROM crm_workflow_audit WHERE kind='更新客户档案' AND entity_id='manager-lead'").get();assert.equal(audit.created_by,'manager');assert.equal(JSON.parse(audit.payload).after.profile.city,'Sydney');
 await request('manager','role-workspace/customer',{body:profileBody,status:409});
 await request('manager','role-workspace/customer',{body:{...profileBody,id:'other-lead'},status:403});
 assert.equal(sql.prepare("SELECT detail FROM crm_leads WHERE id='other-lead'").get().detail,'{}','other customers remain unchanged');
 await request('manager','grade',{view:'personal',body:{id:'other-lead',grade:'A'},status:404});
 const preview=(await request('admin','role-preview',{body:{target_id:'manager'}})).response.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('admin','me',{cookie:preview,view:'personal'})).data.id,'manager');
 await request('admin','leads/other-lead',{cookie:preview,view:'personal',status:404});
 await request('admin','grade',{cookie:preview,view:'personal',body:{id:'manager-lead',grade:'B'},status:403});
 sql.prepare("UPDATE crm_users SET must_change_password=1 WHERE id='manager-empty'").run();
 assert.equal((await request('manager-empty','me')).data.must_change_password,true);
 await request('manager-empty','leads',{view:'personal',status:403});
 await request('other','me',{view:'personal',status:403});await request('follower','me',{view:'personal',status:403});
 console.log('PASS: '+requests+' HTTP requests; every manager switches without snapshots, empty accounts stay empty, personal customers/orders stay owned, direct foreign orders are denied, shared records stay unified and initial-password/read-only guards remain.');
}finally{delete globalThis.__managementPersonalEnv;sql.close();rmSync(dir,{recursive:true,force:true});}
