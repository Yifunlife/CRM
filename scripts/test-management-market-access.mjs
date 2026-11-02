import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {database,moduleURL} from './test-form-intake.mjs';
const tmp=mkdtempSync(tmpdir()+'/crm-market-access-');
try{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
 const {digest,can,canSetManagement,boardMarkets}=await import(moduleURL('lib/crm.ts'));
 const {suiteDay}=await import(moduleURL('lib/sales-suite.ts'));
 const people=[['b7e34925-ec83-4f4e-ad42-04be344dc82b','management',['foreign']],['b9bde8d1-8f87-4981-956b-128423cd6651','ceo',[]],['588a2047-59ad-49f8-ad38-f963df003046','management',['domestic']],['other-admin','admin',[]],['foreign-manager','management',['foreign']],['domestic-manager','management',['domestic']],['dual-manager','management',['domestic','foreign']],['unscoped','management',[]],['sales','sales',['foreign']],['domestic-sales','sales',['domestic']]];
 const authorized=people.slice(0,3).map(p=>p[0]);
 for(const [id,role,scopes] of people){
  sql.prepare('INSERT INTO crm_users(id,username,name,role,password,trade_scopes,created) VALUES(?,?,?,?,?,?,?)').run(id,id,id,role,'test-only',JSON.stringify(scopes),'2026-01-01');
  sql.prepare('INSERT INTO crm_sessions VALUES(?,?,?)').run(await digest('session-'+id),id,Date.now()+3600000);
 }
 for(const [id,country,owner] of [['foreign-lead','美国','sales'],['domestic-lead','中国','domestic-sales']])sql.prepare("INSERT INTO crm_leads(id,name,country,source,owner_id,cohort,business_scope,detail,fingerprint,entered,created) VALUES(?,?,?,'Meta',?,'new','meta-full','{}',?,?,?)").run(id,id,country,owner,id,suiteDay(),suiteDay());
 sql.prepare("INSERT INTO crm_leads(id,name,country,source,cohort,business_scope,detail,fingerprint,entered,created) VALUES('pending','pending','美国','Meta','new','meta-full','{}','pending',?,?)").run(suiteDay(),suiteDay());
 const accountsBefore=sql.prepare('SELECT * FROM crm_users ORDER BY id').all();
 globalThis.__marketAccessEnv={DB:database(sql)};
 await build({entryPoints:['app/api/[...path]/route.ts'],bundle:true,platform:'node',format:'esm',outfile:tmp+'/route.mjs',plugins:[{name:'fixture-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__marketAccessEnv;'}));}}],logLevel:'silent'});
 const route=await import(tmp+'/route.mjs'),origin='https://isolated.invalid';
 async function request(actor,path,body,status=200,view='boss'){
  const method=body===undefined?'GET':'POST',res=await route[method](new Request(origin+'/api/'+path,{method,headers:{origin,cookie:'crm_session=session-'+actor,'Content-Type':'application/json','X-CRM-View':view},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  const data=await res.json();assert.equal(res.status,status,actor+' '+path+' '+JSON.stringify(data));return data;
 }
 const month=suiteDay().slice(0,7),target={owner_id:'sales',currency:'USD',items:[{period:'month',period_start:month+'-01',amount:'100',version:0}]};
 for(const [id,role,scopes] of people){assert.equal(canSetManagement({id,role}),authorized.includes(id));assert.equal(can({id,role,permissions:{leads_allocate:true}},'leads_allocate'),authorized.includes(id));assert.deepEqual(boardMarkets({id,role,trade_scopes:JSON.stringify(scopes)}),(authorized.includes(id)||role==='admin')?['内贸','外贸']:scopes.map(s=>s==='domestic'?'内贸':'外贸'));}
 for(const id of ['other-admin','foreign-manager','domestic-manager','dual-manager','unscoped','sales']){
  const changes=sql.prepare('SELECT total_changes() AS n').get().n;
  for(const path of ['allocation/config','allocation/distribute','allocation/management/preview','allocation/management/confirm','sales-management/targets','sales-monitor','customer-pool/retry'])await request(id,path,{},403);
  await request(id,'import',{allocation_management:true},403);
  assert.equal(sql.prepare('SELECT total_changes() AS n').get().n,changes,'denied requests must not write');
 }
 for(const [index,id] of authorized.entries()){
  await request(id,'sales-management/targets',{...target,items:[{...target.items[0],version:index}]});
  const report=await request(id,'sales-management/report?period=month&month='+month);assert.equal(report.can_edit,true);assert.deepEqual(report.allowed_currencies,['CNY','USD']);
  await request(id,'allocation/config',{scope:'all',config:{members:[{user_id:'sales',state:'参与',share:100}],rule:{performance:30,maxChange:10,minimum:5,automatic:false}}});
  const plan=await request(id,'allocation/management/preview',{ids:['pending'],recipients:['sales']});assert.equal(plan.rows[0].owner_id,'sales');
  await request(id,'role-workspace/report?month='+month+'&market='+encodeURIComponent('内贸'));
  await request(id,'role-workspace/report?month='+month+'&market='+encodeURIComponent('外贸'));
  await request(id,'sales-monitor',{},405);
 }
 await request(authorized[1],'grade',{id:'foreign-lead',grade:'A'});
 await request(authorized[1],'users/permissions',{},400);
 await request(authorized[1],'sales-management/targets',target,403,'personal');
 await request('other-admin','allocation/management/preview',{...target,id:authorized[0]},403);
 for(const [actor,allowed,denied,lead] of [['foreign-manager','外贸','内贸','foreign-lead'],['domestic-manager','内贸','外贸','domestic-lead']]){
  const report=await request(actor,'role-workspace/report?month='+month+'&market='+encodeURIComponent(allowed));assert(report.all_customers.some(l=>l.id===lead));assert(report.all_customers.every(l=>l.market===allowed));
  await request(actor,'role-workspace/report?month='+month+'&market='+encodeURIComponent(denied),undefined,403);
  await request(actor,'role-workspace/report?month='+month+'&market='+encodeURIComponent('全部'),undefined,403);
  const sales=await request(actor,'sales-management/report?period=month&month='+month);assert.equal(sales.can_edit,false);assert.deepEqual(sales.allowed_currencies,[allowed==='内贸'?'CNY':'USD']);assert(sales.rows.every(r=>r.currency===(allowed==='内贸'?'CNY':'USD')));
  const monitor=await request(actor,'sales-monitor');assert(monitor.items.every(i=>!i.lead_id||i.lead_id!==(denied==='内贸'?'domestic-lead':'foreign-lead')));
  await request(actor,'allocation/management');
 }
 const adminReport=await request('other-admin','sales-management/report?period=month&month='+month);assert.equal(adminReport.can_edit,false);assert.deepEqual(adminReport.allowed_currencies,['CNY','USD']);
 for(const market of ['内贸','外贸','全部','待确认'])await request('other-admin','role-workspace/report?month='+month+'&market='+encodeURIComponent(market));
 const adminAll=await request('other-admin','role-workspace/report?month='+month+'&market='+encodeURIComponent('全部'));assert(adminAll.all_customers.some(l=>l.id==='foreign-lead'));assert(adminAll.all_customers.some(l=>l.id==='domestic-lead'));
 await request('unscoped','role-workspace/report?month='+month,undefined,403);
 for(const market of ['内贸','外贸'])await request('dual-manager','role-workspace/report?month='+month+'&market='+encodeURIComponent(market));
 const previewFixtures={};
 for(const id of ['foreign-manager','domestic-manager',authorized[0]])previewFixtures[id]={user:(await request(id,'me')),board:await request(id,'role-workspace/report?month='+month+'&market='+encodeURIComponent(id==='domestic-manager'?'内贸':'外贸')),performance:await request(id,'sales-management/report?period=month&month='+month),allocation:await request(id,'allocation/management')};
 writeFileSync('work/access-preview-fixtures.json',JSON.stringify(previewFixtures));
 const plan=await request(authorized[1],'allocation/management/preview',{ids:['pending'],recipients:['sales']});
 const assigned=await request(authorized[1],'allocation/management/confirm',{ids:['pending'],recipients:['sales'],token:plan.token});assert.equal(assigned.assigned,1);
 assert.equal(sql.prepare("SELECT owner_id FROM crm_leads WHERE id='pending'").get().owner_id,'sales');
 assert.equal(sql.prepare("SELECT owner_id FROM crm_leads WHERE id='domestic-lead'").get().owner_id,'domestic-sales');
 assert.deepEqual(sql.prepare('SELECT * FROM crm_users ORDER BY id').all(),accountsBefore);
 assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 console.log('PASS: existing named management access plus CEO business management; other admins/managers retain read-only management settings; both-market access; foreign/domestic/dual dashboards enforced server-side; monitor market isolation; no account/owner changes.');
}finally{rmSync(tmp,{recursive:true,force:true});}
