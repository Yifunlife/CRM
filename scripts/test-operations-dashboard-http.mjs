import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
const origin='http://127.0.0.1:8797';
const login=async(username,password)=>{const r=await fetch(origin+'/api/login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
const admin=await login('admin','local-pool-preview-only');
async function request(path,body,cookie=admin){const r=await fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{origin,cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
async function ok(path,body,cookie){const r=await request(path,body,cookie);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
const key=Date.now(),date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
for(const role of ['sales','operations'])await ok('users',{username:'ops-board-'+role+key,name:'测试·看板'+role+key,role,password:'local-operations-only'});
const users=await ok('users'),sales=users.find(u=>u.username==='ops-board-sales'+key),ops=users.find(u=>u.username==='ops-board-operations'+key);
const sc=await login(sales.username,'local-operations-only'),oc=await login(ops.username,'local-operations-only');
const account=await ok('operations/accounts',{name:'测试·投放账号'+key,platform:'Facebook',owner_id:ops.id});
await ok('advertising',{name:'测试·看板广告费用'+key,platform:'Meta',date,status:'投放中',owner_id:ops.id,budget:'300',spent:'100',account_id:account.id},oc);
const ad=(await ok('advertising',undefined,oc)).find(a=>a.name==='测试·看板广告费用'+key);
const campaign=await ok('attribution/campaigns',{name:'测试·运营看板广告'+key,platform:'Meta',account_id:account.id,reason:'本地测试活动'});
await ok('allocation/config',{scope:'whatsapp',config:{members:[{user_id:sales.id,state:'参与',share:0}],rule:{automatic:true,performance:30,maxChange:10,minimum:5,receipts:true}}});
const ids=[];
for(let i=0;i<2;i++){
 const id=crypto.randomUUID();ids.push(id);await ok('customer-pool/submit',{id,source:'WhatsApp／其他',raw:'测试·广告客户咨询'+i},oc);
 await ok('customer-pool/confirm',{id,version:0,fields:{name:i?'测试·广告客户乙':'测试·广告客户甲',email:key+'-'+i+'@example.invalid',business_scope:'whatsapp',requirement:'测试游乐设备采购',source_kind:'广告活动',campaign_id:campaign.id,attribution_reason:'测试平台线索编号'+i}},oc);
 const pending=(await ok('attribution/report',undefined,oc)).requests.find(r=>r.entity_id===id);
 assert.equal(pending.state,'待核查');assert.equal((await request('attribution/resolve',{id:pending.id,version:1,decision:'确认',reason:'越权'},oc)).status,403);
 await ok('attribution/resolve',{id:pending.id,version:1,decision:'确认',reason:'测试管理员核对'});
 await ok('attribution/quality',{lead_id:id,state:'有效',reason:'测试真实需求已核实',version:0},sc);
}
let p=await ok('attribution/propose',{kind:'spend',entity_id:ad.id,target_version:0,campaign_id:campaign.id,reason:'测试费用关联'},oc);await ok('attribution/resolve',{id:p.id,version:1,decision:'确认',reason:'测试确认费用'});
await ok('grade',{id:ids[0],grade:'A'},sc);await ok('grade',{id:ids[0],grade:'B'},sc);await ok('grade',{id:ids[0],grade:'B'},sc);
await ok('followup',{id:ids[0],status:'正在沟通',content:'测试客户已回复，要求提供方案',method:'WhatsApp',next_step:'准备方案',next_date:date},sc);
await ok('deals',{lead_id:ids[0],order_number:'OPS-BOARD-'+key,deal_date:date});
const detail=await ok('leads/'+ids[0],undefined,sc),deal=detail.deals[0];
p=await ok('attribution/propose',{kind:'deal',entity_id:deal.id,target_version:0,lead_id:ids[0],reason:'测试成交源'},sc);await ok('attribution/resolve',{id:p.id,version:1,decision:'确认',reason:'测试确认成交源'});
await ok('receipts',{deal_id:deal.id,reference:'OPS-BOARD-R-'+key,amount:'300',currency:'USD',received_date:date});
const report=await ok('attribution/report',undefined,oc),row=report.operations.rows.find(r=>r.key===campaign.id);
assert.equal(row.customers,2);assert.equal(row.valid,2);assert.equal(row.converted,1);assert.equal(row.conversion,.5);assert.equal(row.spent_minor,10000);assert.equal(row.cost_per_valid_minor,5000);assert.equal(row.grades.B,1);
const changes=report.changes.filter(e=>e.entity_id===ids[0]);assert.equal(changes.filter(e=>e.kind==='客户分类变化').length,2);assert(changes.some(e=>e.payload.before==='A'&&e.payload.after==='B'&&e.actor_name===sales.name));assert(changes.some(e=>e.kind==='跟进状态变化'));assert(detail.changes.some(e=>e.payload.after==='B'));
const own=await ok('attribution/report',undefined,sc);assert.equal(own.operations,null);assert(own.changes.every(e=>ids.includes(e.entity_id)));assert.equal(own.ads.length,0);
const other=(await ok('leads')).find(l=>l.owner_id&&l.owner_id!==sales.id);if(other){assert.equal((await request('grade',{id:other.id,grade:'A'},sc)).status,404);assert.equal((await request('leads/'+other.id,undefined,sc)).status,404);}
assert.equal((await request('attribution/report',undefined,'')).status,401);
mkdirSync('../outputs/operations-dashboard-20261029',{recursive:true});writeFileSync('../outputs/operations-dashboard-20261029/http-verification.json',JSON.stringify({status:'local-only',campaign:campaign.id,customer_ids:ids,tests:['intake source approval','operations audit read','sales owner isolation','no-op category audit','50% cohort conversion','USD50 valid-customer cost','current categories','detail changes','anonymous denied'],production_writes:0},null,2));
console.log('PASS: local HTTP intake→approval→spend→sales classification/follow-up→deal→operations dashboard, audit history, 50% conversion, USD50 valid-customer cost, permissions.');
