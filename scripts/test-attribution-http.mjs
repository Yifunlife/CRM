import assert from 'node:assert/strict';
const origin='http://127.0.0.1:8794';
async function login(username,password){const r=await fetch(origin+'/api/login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
const cookie=await login('admin','local-attribution-review-only');
async function request(path,body,session=cookie){const r=await fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{origin,cookie:session,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
async function ok(path,body,session=cookie){const r=await request(path,body,session);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
const key=Date.now();
for(const name of ['甲','乙'])await ok('users',{username:'attr'+(name==='甲'?'a':'b')+key,name:'归因测试'+name+key,role:'sales',password:'local-attribution-test-only'});
const users=await ok('users'),a=users.find(u=>u.username==='attra'+key),b=users.find(u=>u.username==='attrb'+key),admin=users.find(u=>u.username==='admin');
await ok('import',{source:'Meta',business_scope:'meta-full',filename:'attribution-isolated-test',rows:[{客户名称:'归因隔离样本 · 首期项目',邮箱:key+'a@example.invalid'},{客户名称:'归因隔离样本 · 再次咨询',邮箱:key+'b@example.invalid'},{客户名称:'其他业务员的咨询',邮箱:key+'c@example.invalid'}]});
const leads=(await ok('leads')).filter(l=>l.email.startsWith(String(key))),first=leads.find(l=>l.email.includes('a@')),lost=leads.find(l=>l.email.includes('b@')),hidden=leads.find(l=>l.email.includes('c@'));
await ok('allocation/config',{scope:'meta-full',config:{members:[{user_id:a.id,state:'参与',share:50},{user_id:b.id,state:'参与',share:50}],rule:{performance:30,maxChange:10,minimum:5,automatic:false,receipts:true}}});
for(const [l,u]of [[first,a],[lost,a],[hidden,b]]){await ok('allocation/config',{scope:'meta-full',config:{members:[{user_id:u.id,state:'参与',share:0}],rule:{performance:30,maxChange:10,minimum:5,automatic:false}}});await ok('allocation/distribute',{ids:[l.id],scope:'meta-full'});}
const account=await ok('operations/accounts',{name:'隔离Meta账号'+key,platform:'Facebook',owner_id:admin.id});
await ok('advertising',{name:'隔离活动费用'+key,platform:'Meta',date:'2026-10-01',status:'投放中',owner_id:admin.id,budget:'100',spent:'100',account_id:account.id});
const ad=(await ok('advertising')).find(r=>r.name==='隔离活动费用'+key);
const campaign=await ok('attribution/campaigns',{name:'隔离测试活动'+key,platform:'Meta',account_id:account.id,reason:'测试活动原始资料核对'});
const salesCookie=await login(a.username,'local-attribution-test-only');
assert.equal((await request('attribution/report',undefined,'')).status,401);
assert.equal((await request('attribution/campaigns',{name:'越权'},salesCookie)).status,403);
assert.equal((await request('attribution/propose',{kind:'lead',entity_id:hidden.id,target_version:0,source_kind:'自然流量',reason:'无权'},salesCookie)).status,404);
async function associate(kind,entity,payload,session=cookie){const p=await ok('attribution/propose',{kind,entity_id:entity,target_version:0,reason:'人工核对隔离原始记录',...payload},session);assert.equal((await request('attribution/resolve',{id:p.id,version:1,decision:'确认',reason:'越权'},salesCookie)).status,403);await ok('attribution/resolve',{id:p.id,version:1,decision:'确认',reason:'管理员核实来源证据'});assert.equal((await request('attribution/resolve',{id:p.id,version:1,decision:'确认',reason:'重复'},cookie)).status,409);}
await associate('lead',first.id,{source_kind:'广告活动',campaign_id:campaign.id,assists:[]},salesCookie);
await associate('spend',ad.id,{campaign_id:campaign.id});
await ok('attribution/quality',{lead_id:first.id,state:'有效',reason:'真实需求已核实',version:0},salesCookie);
await ok('deals',{lead_id:first.id,order_number:'ATTR-'+key,deal_date:'2026-10-02'});const deal=(await ok('leads/'+first.id)).deals[0];
await associate('deal',deal.id,{lead_id:first.id},salesCookie);
await ok('receipts',{deal_id:deal.id,reference:'ATTR-R-'+key,amount:'300',currency:'USD',received_date:'2026-10-03'});const receipt=(await ok('leads/'+first.id)).receipts[0];
await ok('workflow/refunds',{receipt_id:receipt.id,reference:'ATTR-F-'+key,amount:'50',refunded_date:'2026-10-04',reason:'隔离实际退款样本'});
const summary=(await ok('attribution/report?from=2026-10-01&to=2026-10-31')).summary.find(s=>s.key===campaign.id&&s.currency==='USD');assert.equal(summary.net_minor,25000);assert.equal(summary.roas,2.5);
const sales=await ok('attribution/report',undefined,salesCookie);assert(!sales.leads.some(l=>l.id===hidden.id));assert.equal(sales.summary.find(s=>s.key===campaign.id).spent_minor,null);assert.equal(sales.events.length,0);
const old=await ok('leads/'+lost.id);assert.equal((await request('followup',{id:lost.id,status:'已结束',content:'缺少原因'},salesCookie)).status,400);assert.deepEqual(await ok('leads/'+lost.id),old,'Failed closing does not write notes or status');
await ok('followup',{id:lost.id,status:'已结束',content:'客户反馈预算不足',loss_reason:'预算不符',loss_note:'客户明确回复预算不足'},salesCookie);
assert.equal((await ok('attribution/report',undefined,salesCookie)).leads.find(l=>l.id===lost.id).outcome.reason,'预算不符');
await ok('followup',{id:first.id,status:'已结束',content:'已成交后本次跟进结束'},salesCookie);
const backup=await fetch(origin+'/api/admin/backup',{headers:{cookie}});assert.equal(backup.status,200);const footer=(await backup.text()).trim().split('\n').map(JSON.parse).at(-1);assert(footer.complete&&footer.counts.crm_attribution_campaigns>0&&footer.counts.crm_lead_outcomes>0);
console.log('PASS: isolated HTTP login, 401/403/404/409, manual approval, real receipt/refund aggregation, owner privacy, closing validation with rollback and backup inclusion.');
console.log(JSON.stringify({sales_username:a.username,campaign_id:campaign.id,first:first.id,lost:lost.id}));
