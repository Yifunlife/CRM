import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {build} from 'esbuild';
import {database,moduleURL} from './test-form-intake.mjs';
const dir=mkdtempSync(tmpdir()+'/crm-dormant-inbox-'),sql=new DatabaseSync(':memory:');
const log=console.log;console.log=()=>{};
try{
 sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
 const {digest}=await import(moduleURL('lib/crm.ts'));
 for(const [id,role] of [['a','sales'],['b','sales'],['admin','admin'],['staff','followup']]){
  sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(id,id,id,role,'unchanged','2026-11-04');
  sql.prepare('INSERT INTO crm_sessions VALUES(?,?,?)').run(await digest('inbox-'+id),id,Date.now()+3600000);
 }
 for(const [id,owner] of [['own','a'],['other','b'],['admin-lead','admin']])sql.prepare("INSERT INTO crm_leads(id,name,source,owner_id,detail,fingerprint,created) VALUES(?,?,'Meta',?,'{}',?,'2026-11-01')").run(id,id,owner,id);
 sql.exec("INSERT INTO crm_sales_tasks(id,lead_id,kind,title,owner_id,due_at,next_action,token,created,created_by,updated,updated_by) VALUES('delegated-task','other','followup','人工任务','a','2026-11-01','核实资料','token','2026-11-01','admin','2026-11-01','admin')");
 function notice(id,key,recipient,lead,task=null,created='2026-11-03T00:00:00Z',resolved=''){
  sql.prepare('INSERT INTO crm_sales_notifications(id,dedupe_key,recipient_id,lead_id,task_id,title,content,created,resolved_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,key,recipient,lead,task,id,'保留通知内容',created,resolved);
 }
 for(let i=0;i<205;i++)notice('legacy-a-'+i,'dormant:old:a:'+i,'a','own',null,'2026-11-04T00:00:52Z');
 for(let i=0;i<10;i++)notice('legacy-b-'+i,'dormant:old:b:'+i,'b','other',null,'2026-11-04T00:00:52Z');
 notice('legacy-admin','dormant:old:admin','admin','admin-lead');
 notice('legacy-resolved','dormant:resolved:a','a','own',null,'2026-11-04T00:00:52Z','2026-11-04T01:00:00Z');
 notice('normal-a','manual-task:a','a','own');notice('quote-a','quote-ready:a','a','own');
 notice('delegated-a','manual-task:delegated','a','other','delegated-task');
 notice('hidden-a','manual-task:inaccessible','a','other');notice('normal-b','manual-task:b','b','other');notice('normal-admin','manual-task:admin','admin','admin-lead');
 const legacy=()=>JSON.stringify(sql.prepare("SELECT * FROM crm_sales_notifications WHERE dedupe_key LIKE 'dormant:%' ORDER BY id").all()),legacyBefore=legacy();
 const business=()=>JSON.stringify(['crm_users','crm_leads','crm_notes','crm_assignments','crm_sales_tasks'].map(t=>sql.prepare('SELECT * FROM '+t+' ORDER BY id').all())),businessBefore=business();
 globalThis.__dormantInboxEnv={DB:database(sql)};
 await build({entryPoints:['app/api/[...path]/route.ts'],bundle:true,platform:'node',format:'esm',outfile:dir+'/route.mjs',logLevel:'silent',plugins:[{name:'inbox-fixture',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__dormantInboxEnv;'}));}}]});
 const route=await import(dir+'/route.mjs');
 async function request(path,user='a',body,expected=200){
  const method=body===undefined?'GET':'POST';
  const response=await route[method](new Request('https://fixture.invalid/api/'+path,{method,headers:{origin:'https://fixture.invalid',cookie:'crm_session=inbox-'+user,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  const data=await response.json();assert.equal(response.status,expected,path+' '+JSON.stringify(data));assert.equal(response.headers.get('Cache-Control'),'no-store');return data;
 }
 const mine=await request('followup-notifications');
 assert.deepEqual(mine.notifications.map(n=>n.id).sort(),['delegated-a','normal-a','quote-a']);
 assert(mine.notifications.every(n=>!n.dedupe_key.startsWith('dormant:')),'retired notices are removed before the 200-result limit');
 assert.deepEqual((await request('followup-notifications','b')).notifications.map(n=>n.id),['normal-b']);
 const audit=await request('followup-notifications/audit','admin');
 assert(audit.notifications.some(n=>n.id==='normal-a')&&audit.notifications.some(n=>n.id==='normal-b')&&audit.notifications.some(n=>n.id==='normal-admin'));
 assert(audit.notifications.every(n=>!n.dedupe_key.startsWith('dormant:')),'audit inbox also excludes legacy dormant prompts');
 await request('followup-notifications/audit','a',undefined,403);
 assert.equal((await request('followup-notifications','staff')).notifications.length,0);
 assert.equal(legacy(),legacyBefore,'reading all inbox variants leaves historical notices unchanged');
 const read=await request('followup-notifications/read-all','a',{});assert.equal(read.updated,3);
 for(const id of ['normal-a','quote-a','delegated-a'])assert(sql.prepare('SELECT read_at FROM crm_sales_notifications WHERE id=?').get(id).read_at);
 for(const id of ['normal-b','hidden-a','normal-admin'])assert.equal(sql.prepare('SELECT read_at FROM crm_sales_notifications WHERE id=?').get(id).read_at,'');
 assert.equal(legacy(),legacyBefore,'bulk read leaves retired and hidden historical notices untouched');
 assert.equal((await request('followup-notifications/read-all','a',{})).updated,0);
 assert((await request('followup-notifications')).notifications.every(n=>!n.dedupe_key.startsWith('dormant:')));
 assert.equal(business(),businessBefore);assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 log('PASS: actual inbox and audit HTTP routes; 205 recent legacy notices cannot crowd out normal/delegated/quote notices; retired resolved/unresolved entries excluded; recipient/role isolation; bulk read preserves legacy records; no business-data changes.');
}finally{console.log=log;delete globalThis.__dormantInboxEnv;sql.close();rmSync(dir,{recursive:true,force:true});}
