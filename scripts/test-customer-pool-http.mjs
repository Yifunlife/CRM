import assert from 'node:assert/strict';
const origin='http://127.0.0.1:8797';
const login=async(username,password)=>{const r=await fetch(origin+'/api/login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(r.status,200,await r.clone().text());return r.headers.get('set-cookie').split(';')[0];};
const cookie=await login('admin','local-pool-preview-only');
async function request(path,body,session=cookie){const response=await fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{cookie:session,origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
async function ok(path,body,session){const result=await request(path,body,session);assert.equal(result.status,200,JSON.stringify(result.data));return result.data;}
const key=Date.now();
for(const name of ['A','B'])await ok('users',{username:'pool'+name.toLowerCase()+key,name:'测试业务员'+name,role:'sales',password:'pool-test-employee-only'});
const users=await ok('users'),members=users.filter(u=>u.username.endsWith(String(key)));
const config={members:members.map(u=>({user_id:u.id,state:'参与',share:0})),rule:{automatic:true,receipts:true,performance:30,maxChange:10,minimum:5}};
await ok('allocation/config',{scope:'whatsapp',config});
const ids=[];
for(let i=0;i<4;i++){
 const id=crypto.randomUUID();ids.push(id);const raw='测试咨询：'+['迪拜亲子乐园，咨询200平方米儿童区设备','智利商场室内乐园，询问设计与报价','原有客户再次询问追加产品','员工提交的消息缺少联系方式，等待补充'][i];
 await ok('customer-pool/submit',{id,source:'WhatsApp／其他',raw});
 if(i<2)await ok('customer-pool/confirm',{id,version:0,fields:{name:['测试·迪拜亲子乐园','测试·智利商场乐园'][i],phone:'971500'+String(key).slice(-5)+i,email:'',country:i?'智利':'阿联酋',business_scope:'whatsapp',requirement:i?'室内乐园设备与设计':'200平方米儿童区设备',summary:'隔离测试资料'}});
}
let report=await ok('customer-pool');const done=report.rows.filter(r=>ids.slice(0,2).includes(r.id));assert.equal(done.length,2);assert.equal(new Set(done.map(r=>r.owner_id)).size,2);
const first=done.find(r=>r.id===ids[0]);
const fields={...first.payload};
assert.equal((await request('customer-pool/confirm',{id:ids[2],version:0,fields})).status,400);
await ok('customer-pool/confirm',{id:ids[2],version:0,fields,target_lead_id:first.lead_id,reason:'测试：确认是同一位客户'});
await ok('customer-pool/retry',{});
assert.equal((await ok('leads')).filter(l=>ids.includes(l.id)).length,2);
assert.equal((await request('assign',{ids:[ids[3]],owner_id:members[0].id})).status,409);
const receiver=members.find(u=>u.id===first.owner_id),receiverCookie=await login(receiver.username,'pool-test-employee-only');
const outsider=members.find(u=>u.id!==first.owner_id),outsiderCookie=await login(outsider.username,'pool-test-employee-only');
assert.equal((await request('leads/'+first.lead_id,undefined,outsiderCookie)).status,404);
await ok('followup',{id:first.lead_id,status:'正在沟通',content:'测试：客户确认需要分区报价',method:'WhatsApp',next_step:'发送已审核报价',next_date:report.today},receiverCookie);
const own=await ok('customer-pool',undefined,receiverCookie);assert.ok(own.rows.find(r=>r.id===ids[2]).followed);assert.ok(own.todo.some(r=>r.id===first.lead_id));
assert.equal((await request('customer-pool/review',{id:ids[3],fields:{}},receiverCookie)).status,403);
assert.equal((await request('customer-pool',undefined,'')).status,401);
// Backup includes both new tables with ordered dependencies.
const response=await fetch(origin+'/api/admin/backup',{headers:{cookie}}),lines=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
assert.ok(lines.at(-1).complete);assert.ok(lines.at(-1).counts.crm_customer_pool>=4);assert.ok(lines.at(-1).counts.crm_pool_events>=8);
console.log('PASS: isolated HTTP login, submit/confirm, equal split, duplicate review, old-customer append, lead ownership, follow-up reflection, removed manual allocation bypass and complete backup.');
