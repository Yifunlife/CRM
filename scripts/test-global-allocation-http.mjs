import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {Miniflare} from 'miniflare';
const origin='http://127.0.0.1:8798';
const login=await fetch(origin+'/api/login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'local-global-preview-only'})});assert.equal(login.status,200);
const cookie=login.headers.get('set-cookie').split(';')[0];
async function request(path,body){const r=await fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{origin,cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
async function ok(path,body){const r=await request(path,body);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
const key=String(Date.now()),roles=[...Array(7).fill('sales'),...Array(3).fill('management'),'ceo'];
for(const [i,role] of roles.entries())await ok('users',{username:'global-'+key+'-'+i,name:'测试·'+({sales:'销售',management:'管理层',ceo:'CEO'}[role])+String(i+1).padStart(2,'0'),role,password:'local-global-staff-only'});
const people=(await ok('users')).filter(u=>u.username.startsWith('global-'+key+'-'));
assert.equal(people.length,11);
const config={members:people.map(u=>({user_id:u.id,state:'参与',share:0})),rule:{automatic:true,performance:30,maxChange:10,minimum:5}};
await ok('allocation/config',{scope:'all',config});
assert.equal((await request('allocation/config',{scope:'google',config})).status,409);
const channels=[['google','Google 广告'],['meta-product','Meta'],['meta-full','Meta'],['whatsapp','WhatsApp／其他'],['website','独立站'],['alibaba','阿里'],['douyin-local','抖音']];
for(let i=0;i<77;i++){
 const [scope,source]=channels[i%channels.length];
 const result=await ok('import',{source,business_scope:scope,filename:'全渠道平均分配隔离测试',rows:[{'客户名称':'测试·共同分配'+key+'-'+i,'邮箱':key+'-'+i+'@example.invalid'}]});assert.equal(result.autoAssigned,1);
 if(i===10){const first=(await ok('leads')).filter(l=>l.name.startsWith('测试·共同分配'+key));assert.equal(new Set(first.map(l=>l.owner_id)).size,11,'First 11 mixed-channel customers must reach 11 people');}
}
const leads=(await ok('leads')).filter(l=>l.name.startsWith('测试·共同分配'+key));assert.equal(leads.length,77);
const counts=people.map(u=>leads.filter(l=>l.owner_id===u.id).length);assert.deepEqual(counts,Array(11).fill(7));
const global=await ok('allocation/report?scope=all');assert.equal(global.config_scope,'all');assert.equal(global.policy,'equal-global-v1');
for(const [scope] of channels){const r=await ok('allocation/report?scope='+scope);assert.deepEqual(r.config,global.config);assert.deepEqual(r.globalAssigned,global.globalAssigned);}
// Pausing is global, and scheduled processing uses the same shared configuration.
const pending=crypto.randomUUID();await ok('allocation/config',{scope:'all',config:{...config,rule:{...config.rule,automatic:false}}});
await ok('customer-pool/submit',{id:pending,source:'WhatsApp／其他',raw:'测试·共同分配后台重试'});
await ok('customer-pool/confirm',{id:pending,version:0,fields:{name:'测试·共同队列后台客户',email:key+'-pending@example.invalid',business_scope:'whatsapp',requirement:'测试设备需求'}});
assert.equal((await ok('customer-pool')).rows.find(r=>r.id===pending).state,'待分配');
await ok('allocation/config',{scope:'all',config});
const root=resolve('dist/server'),files=readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.js'));files.splice(files.indexOf('index.js'),1);files.unshift('index.js');
const mf=new Miniflare({name:'global-allocation-scheduled-test',modules:files.map(f=>({type:'ESModule',path:resolve(root,f)})),modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'59e890b8-985a-4027-a205-50d8920509cb'},d1Persist:'work/global-allocation-20261029/v3/d1'});
try{const worker=await mf.getWorker();assert.equal((await worker.scheduled({cron:'*/5 * * * *'})).outcome,'ok');assert.equal((await worker.scheduled({cron:'*/5 * * * *'})).outcome,'ok');}finally{await mf.dispose();}
assert.equal((await ok('customer-pool')).rows.find(r=>r.id===pending).state,'已入CRM');
const before=(await ok('allocation/report?scope=all')).globalAssigned;
const repeat=crypto.randomUUID(),original=leads[0];await ok('customer-pool/submit',{id:repeat,source:'独立站',raw:'测试·已有客户从另一渠道再次咨询'});
await ok('customer-pool/confirm',{id:repeat,version:0,fields:{name:original.name,email:original.email,business_scope:'website',requirement:'测试追加需求'},target_lead_id:original.id,reason:'测试确认同一客户'});
assert.deepEqual((await ok('allocation/report?scope=all')).globalAssigned,before);
assert.equal((await ok('leads/'+original.id)).owner_id,original.owner_id);
const after=(await ok('allocation/report?scope=all')).globalAssigned;assert.equal(after.reduce((n,r)=>n+r.n,0),78);
mkdirSync('../outputs/global-allocation-20261029',{recursive:true});writeFileSync('../outputs/global-allocation-20261029/http-verification.json',JSON.stringify({status:'local-only',participants:11,roles:{sales:7,management:3,ceo:1},channels:7,interleaved_imports:77,counts,first_11_unique_owners:11,scheduled_retry:'passed twice without duplicate',old_customer_owner_preserved:true,old_customer_consumed_new_slot:false,stale_scoped_settings_rejected:true,production_test_data:0},null,2)+'\n');
console.log('PASS: live local Worker distributes 77 interleaved clients from 7 channels equally to 11 people (7 each); first 11 owners unique; shared configuration/counters, scheduled retry, old ownership and stale-client rejection.');
