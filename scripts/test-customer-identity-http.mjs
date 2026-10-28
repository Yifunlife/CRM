import assert from 'node:assert/strict';
const origin='http://127.0.0.1:8793';
async function login(username,password){const r=await fetch(origin+'/api/login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
const cookie=await login('admin','local-identity-review-only');
async function request(path,body,session=cookie,view){const r=await fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{cookie:session,origin,'Content-Type':'application/json',...(view?{'X-CRM-View':view}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
const key=Date.now();
for(const name of ['甲','乙'])assert.equal((await request('users',{username:'identity'+(name==='甲'?'a':'b')+key,name:'主体测试'+name,role:'sales',password:'local-identity-test-only'})).status,200);
const users=(await request('users')).data,a=users.find(u=>u.username==='identitya'+key),b=users.find(u=>u.username==='identityb'+key),admin=users.find(u=>u.username==='admin');
const rows=[{客户名称:'隔离测试公司 · 首次咨询',邮箱:key+'a@example.invalid',公司名称:'隔离测试公司'},{客户名称:'隔离测试公司 · 再次咨询',邮箱:key+'b@example.invalid',公司名称:'隔离测试公司'},{客户名称:'其他业务员咨询',邮箱:key+'c@example.invalid',公司名称:'隔离测试公司'}];
assert.equal((await request('import',{source:'Meta',business_scope:'meta-full',filename:'identity-isolated-test',rows})).status,200);
const leads=(await request('leads')).data.filter(l=>l.email.startsWith(String(key))),first=leads.find(l=>l.email.includes('a@')),second=leads.find(l=>l.email.includes('b@')),hidden=leads.find(l=>l.email.includes('c@'));
assert.equal((await request('allocation/config',{scope:'all',config:{members:[{user_id:a.id,state:'参与',share:50},{user_id:b.id,state:'参与',share:50}],rule:{performance:30,maxChange:10,minimum:5,automatic:false,receipts:true}}})).status,200);
for(const [lead,owner] of [[first,a],[second,a],[hidden,b]]){assert.equal((await request('allocation/config',{scope:'all',config:{members:[{user_id:owner.id,state:'参与',share:0}],rule:{performance:30,maxChange:10,minimum:5,automatic:false}}})).status,200);assert.equal((await request('allocation/distribute',{ids:[lead.id],scope:'meta-full'})).status,200);}
for(const [lead,num] of [[first,'ID-A'],[second,'ID-B'],[hidden,'ID-C']])assert.equal((await request('deals',{lead_id:lead.id,order_number:num+key,deal_date:'2026-10-01'})).status,200);
const deal=(await request('leads/'+first.id)).data.deals[0];
const o=await request('followup',{project:'原跟单项目名称',deal_id:deal.id,order_number:deal.order_number,lead_id:first.id,logistics_id:admin.id});assert.equal(o.status,200);
const backup=async()=>{const r=await fetch(origin+'/api/admin/backup',{headers:{cookie}});assert.equal(r.status,200);return (await r.text()).trim().split('\n').map(JSON.parse).filter(x=>x.table&&!x.table.startsWith('crm_customer_'));};
const before=await backup();
const salesCookie=await login(a.username,'local-identity-test-only');
let r=await request('identity/report');assert.equal(r.status,200);assert.equal(r.data.subjects.length,0);
assert.equal((await request('identity/report',undefined,'')).status,401);
assert.equal((await request('identity/candidates',{lead_id:hidden.id},salesCookie)).status,404);
const hints=await request('identity/candidates',{lead_id:first.id},salesCookie);assert.equal(hints.status,200);assert(hints.data.candidates.some(l=>l.id===second.id));assert(!hints.data.candidates.some(l=>l.id===hidden.id));
const master={name:'隔离测试统一主体',kind:'企业',country:'中国',contacts:[{name:'管理员核实联系人',phone:'13800000000',email:'confirmed@example.invalid'}],reason:'隔离环境人工核对合同抬头'};
assert.equal((await request('identity/subjects',master,salesCookie)).status,403);
const s=await request('identity/subjects',master);assert.equal(s.status,200);const subject_id=s.data.id;
for(const l of [first,hidden])assert.equal((await request('identity/link',{lead_id:l.id,subject_id,reason:'隔离测试逐条确认'})).status,200);
r=await request('identity/report',undefined,salesCookie);assert.equal(r.data.subjects[0].deal_count,1);assert.equal(r.data.subjects[0].repurchase,false);assert.deepEqual(r.data.subjects[0].contacts,[]);
const review=await request('identity/reviews',{lead_id:second.id,other_lead_id:first.id,subject_id,reason:'同一公司第二次咨询，申请核查'},salesCookie);assert.equal(review.status,200);
assert.equal((await request('identity/reviews/resolve',{id:review.data.id,version:1,decision:'确认同一客户',subject_id,reason:'人工核对'},salesCookie)).status,403);
assert.equal((await request('identity/reviews/resolve',{id:review.data.id,version:1,decision:'确认同一客户',subject_id,reason:'管理员人工核对两次咨询'})).status,200);
r=await request('identity/report',undefined,salesCookie);assert.equal(r.data.subjects[0].deal_count,2);assert.equal(r.data.subjects[0].repurchase,true);assert.equal(r.data.leads.length,2);
const p=await request('identity/projects',{subject_id,name:'隔离测试首期项目',reason:'人工核对项目范围'});assert.equal(p.status,200);
for(const [kind,entity_id] of [['lead',first.id],['deal',deal.id],['order',o.data.id]])assert.equal((await request('identity/project-link',{kind,entity_id,project_id:p.data.id,reason:'逐项人工核对'})).status,200);
assert.equal((await request('identity/unlink',{lead_id:first.id,subject_id,reason:'项目未解除'})).status,409);
assert.deepEqual(await backup(),before,'all old business rows preserved over real HTTP identity workflow');
console.log('PASS: real local HTTP authentication, 401/403/404/409, candidate privacy, manual reviews, scoped repurchase, project associations, unlink protection and unchanged original business data.');
console.log(JSON.stringify({subject_id,project_id:p.data.id,first:first.id,second:second.id,sales_username:a.username}));
