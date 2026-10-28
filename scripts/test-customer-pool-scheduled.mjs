import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const origin='http://127.0.0.1:8797';
const login=await fetch(origin+'/api/login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'local-pool-preview-only'})});assert.equal(login.status,200);
const cookie=login.headers.get('set-cookie').split(';')[0];
async function api(path,body){const r=await fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{origin,cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
const prior=(await api('allocation/report?scope=whatsapp')).config;
const id=crypto.randomUUID(),phone='614'+String(Date.now()).slice(-8);
try{
 await api('allocation/config',{scope:'whatsapp',config:{...prior,rule:{...prior.rule,automatic:false}}});
 await api('customer-pool/submit',{id,source:'WhatsApp／其他',raw:'隔离定时任务验证，等待后台分配'});
 await api('customer-pool/confirm',{id,version:0,fields:{name:'测试·后台待分配',phone,business_scope:'whatsapp',requirement:'测试后台自动恢复分配'}});
 assert.equal((await api('customer-pool')).rows.find(r=>r.id===id).state,'待分配');
 await api('allocation/config',{scope:'whatsapp',config:{...prior,rule:{...prior.rule,automatic:true}}});
 const root=resolve('dist/server'),files=readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.js'));
 files.splice(files.indexOf('index.js'),1);files.unshift('index.js');
 const mf=new Miniflare({name:'pool-scheduled-test',modules:files.map(f=>({type:'ESModule',path:resolve(root,f)})),modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'59e890b8-985a-4027-a205-50d8920509cb'},d1Persist:'work/customer-pool-20261029/v3/d1'});
 try{const worker=await mf.getWorker();assert.equal((await worker.scheduled({cron:'*/5 * * * *'})).outcome,'ok');assert.equal((await worker.scheduled({cron:'*/5 * * * *'})).outcome,'ok');}finally{await mf.dispose();}
 const row=(await api('customer-pool')).rows.find(r=>r.id===id);assert.equal(row.state,'已入CRM');assert.ok(row.owner_id);
 assert.equal((await api('leads')).filter(l=>l.id===id).length,1);
 console.log('PASS: built scheduled Worker processes pending intake without a page action; replay creates no duplicate lead.');
}finally{await api('allocation/config',{scope:'whatsapp',config:prior});}
