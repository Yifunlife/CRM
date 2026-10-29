import {SOURCE_KINDS} from './attribution';
import {customerProgress} from './customer-progress';
import {SOURCES,can,clean,emailKey,phoneKey,id,now} from './crm';
import {BUSINESS_SCOPES} from './allocation';
import {AllocationError,allocationWeights,distribute} from './allocation-server';
import {enquiryNotification} from './lead-notifications';

const manager=(user:any)=>can(user,'customers_all')&&can(user,'leads_allocate');
const day=(at:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
function fields(input:any){return Object.fromEntries(['name','phone','email','country','requirement','summary','business_scope','source_kind','campaign_id','attribution_reason'].map(key=>[key,clean(input?.[key],['requirement','summary','attribution_reason'].includes(key)?4000:200)]));}
function event(db:D1Database,key:string,actor:string,kind:string,payload:any){return db.prepare('INSERT INTO crm_pool_events(id,intake_id,actor_id,kind,payload,created) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(id(),key,actor,kind,JSON.stringify(payload),now());}
async function matches(db:D1Database,data:any){
 const rows=(await db.prepare('SELECT l.id,l.name,l.phone,l.email,l.owner_id,l.original_owner,l.review,u.name AS owner_name,u.active AS owner_active FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id').all<any>()).results;
 return rows.filter(l=>data.phone&&phoneKey(data.phone)&&phoneKey(data.phone)===phoneKey(l.phone)||data.email&&emailKey(data.email)===emailKey(l.email));
}

// Only explicitly confirmed pool records are processed. Historical unassigned leads are not scanned.
export async function processCustomerPool(db:D1Database,at=now()){
 const pending=(await db.prepare("SELECT * FROM crm_customer_pool WHERE state='待分配' ORDER BY updated,id LIMIT 50").all<any>()).results;
 for(const row of pending){
  const data=JSON.parse(row.payload),actor=row.confirmed_by;
  try{
   const reviewer=await db.prepare('SELECT id,role,permissions FROM crm_users WHERE id=? AND active=1').bind(actor).first<any>();
   if(!reviewer||!manager(reviewer))throw new Error('确认人已停用或无分配权限，请运营重新确认');
   if(row.target_lead_id){
    const lead=await db.prepare('SELECT l.*,u.active FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id WHERE l.id=?').bind(row.target_lead_id).first<any>();
    if(!lead?.owner_id||!lead.active)throw new Error('原客户负责人无效，请先完成客户交接，再重新确认');
    await db.batch([
     db.prepare("INSERT OR IGNORE INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) SELECT ?,?,?,?,'新咨询','请核对本次需求并安排跟进',? WHERE EXISTS(SELECT 1 FROM crm_customer_pool WHERE id=? AND state='待分配' AND version=?)").bind('pool:'+row.id,lead.id,actor,`客户池新咨询｜${row.source}\n需求：${data.requirement}\n摘要：${data.summary}\n原始内容：${row.raw}`,at,row.id,row.version),
     db.prepare("UPDATE crm_customer_pool SET state='已入CRM',lead_id=?,last_error='',updated=?,version=version+1 WHERE id=? AND state='待分配' AND version=? AND EXISTS(SELECT 1 FROM crm_notes WHERE id=?)").bind(lead.id,at,row.id,row.version,'pool:'+row.id),
     event(db,row.id,actor,'追加原客户咨询',{lead_id:lead.id,owner_id:lead.owner_id}),
     enquiryNotification(db,'pool:'+row.id,lead.id,`客户再次询问｜${row.source}\n需求：${data.requirement}\n原始内容：${row.raw}`,at)
    ]);
    continue;
   }
   let lead=await db.prepare('SELECT id,owner_id,review,business_scope FROM crm_leads WHERE id=?').bind(row.id).first<any>();
   if(!lead){
    const duplicates=await matches(db,data);
    if(duplicates.length&&!data.distinct_reason)throw new Error('发现相同联系方式，请核查是否已有客户');
    const detail=JSON.stringify({'项目需求描述':data.requirement,'客户需求摘要':data.summary,'原始内容':row.raw,'客户池记录':row.id,'确认新客户依据':data.distinct_reason||'','客户池电话键':phoneKey(data.phone),'客户池邮箱键':emailKey(data.email)});
    await db.batch([
     db.prepare(`INSERT OR IGNORE INTO crm_leads(id,name,phone,email,country,source,business_scope,entered,detail,fingerprint,created)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_customer_pool WHERE id=? AND state='待分配' AND version=?)
      AND (?<>'' OR NOT EXISTS(SELECT 1 FROM crm_leads WHERE (?<>'' AND json_extract(detail,'$.客户池电话键')=?) OR (?<>'' AND json_extract(detail,'$.客户池邮箱键')=?)))`).bind(row.id,data.name,data.phone,data.email,data.country,row.source,data.business_scope,day(row.created),detail,'pool:'+row.id,row.created,row.id,row.version,data.distinct_reason||'',phoneKey(data.phone),phoneKey(data.phone),emailKey(data.email),emailKey(data.email)),
     event(db,row.id,actor,'建立CRM客资',{lead_id:row.id})
    ]);
    lead=await db.prepare('SELECT id,owner_id,review,business_scope FROM crm_leads WHERE id=?').bind(row.id).first<any>();
    if(!lead)throw new Error('同期出现相同联系方式，请重新核查客户');
   }
   if(data.source_kind&&data.source_kind!=='未知来源'){
    const requestId='pool-source:'+row.id;
    await db.prepare("INSERT OR IGNORE INTO crm_attribution_requests(id,kind,entity_id,payload,reason,target_version,token,created,created_by,updated,updated_by) VALUES(?,'lead',?,?,?,0,?,?,?,?,?)").bind(requestId,lead.id,JSON.stringify({source_kind:data.source_kind,campaign_id:data.campaign_id||null,assists:[]}),data.attribution_reason,id(),at,actor,at,actor).run();
   }
   if(lead.review)throw new Error('此客资已被标记待核查，请先处理');
   if(!lead.owner_id){
    const {config,weights}=await allocationWeights(db,lead.business_scope);
    if(!config.rule.automatic)throw new Error('全渠道自动分配未开启，请在分配设置启用后重试');
    if(!weights.length)throw new Error('全渠道暂无正常接收人员，请在分配设置配置人员');
    await distribute(db,[lead.id],lead.business_scope,actor);
   }
   await db.batch([
    db.prepare("UPDATE crm_customer_pool SET state='已入CRM',lead_id=?,last_error='',updated=?,version=version+1 WHERE id=? AND state='待分配' AND version=? AND EXISTS(SELECT 1 FROM crm_leads WHERE id=? AND owner_id IS NOT NULL)").bind(lead.id,at,row.id,row.version,lead.id),
    event(db,row.id,actor,'平均分配完成',{lead_id:lead.id,policy:'equal-global-v1'})
   ]);
  }catch(e:any){
   const message=clean(e.message,300),created=await db.prepare('SELECT id FROM crm_leads WHERE id=?').bind(row.id).first(),needsReview=!created&&!message.includes('全渠道');
   await db.batch([
    db.prepare("UPDATE crm_customer_pool SET state=?,last_error=?,updated=?,version=version+1 WHERE id=? AND state='待分配' AND version=?").bind(needsReview?'待确认':'待分配',message,at,row.id,row.version),
    ...(row.last_error!==message?[event(db,row.id,actor,'处理待办',{reason:message})]:[])
   ]);
  }
 }
}

export async function customerPoolEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 if(!path.startsWith('customer-pool'))return undefined;
 const manages=manager(user),timestamp=now();
 if(path==='customer-pool/progress'&&method==='GET')return customerProgress(db,user);
 if(path==='customer-pool'&&method==='GET'){
  const rows=(await db.prepare('SELECT p.*,u.name AS creator_name,l.owner_id,o.name AS owner_name,l.status AS lead_status,l.last_contact FROM crm_customer_pool p JOIN crm_users u ON u.id=p.created_by LEFT JOIN crm_leads l ON l.id=COALESCE(p.lead_id,p.target_lead_id) LEFT JOIN crm_users o ON o.id=l.owner_id'+(manages?'':user.role==='sales'?' WHERE l.owner_id=? OR (p.created_by=? AND l.owner_id IS NULL)':' WHERE p.created_by=? OR l.owner_id=?')+' ORDER BY p.created DESC,p.id LIMIT 300').bind(...(manages?[]:[user.id,user.id])).all<any>()).results;
  const today=day(timestamp),leads=(await db.prepare("SELECT l.id,l.name,l.owner_id,u.name AS owner_name,l.status,l.next_date,l.created FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id WHERE "+(manages?'1=1':'l.owner_id=?')).bind(...(manages?[]:[user.id])).all<any>()).results;
  const assigned=(await db.prepare("SELECT a.owner_id,u.name AS owner_name,COUNT(*) AS count FROM crm_assignments a JOIN crm_users u ON u.id=a.owner_id WHERE a.created>=? AND a.created<?"+(manages?'':' AND a.owner_id=?')+' GROUP BY a.owner_id').bind(...dayBounds(today),...(manages?[]:[user.id])).all<any>()).results;
  const todo=leads.filter(l=>l.next_date&&l.next_date<=today&&!['已成交','已结束','暂停跟进'].includes(l.status));
  const todayPool=manages?await db.prepare("SELECT COUNT(*) total,SUM(state='已入CRM') completed,SUM(state='待确认') review,SUM(state='待分配') pending FROM crm_customer_pool WHERE created>=? AND created<?").bind(...dayBounds(today)).first():null;
  const firstContact=leads.filter(l=>l.status==='待首次联系');
  const campaigns=user.role==='sales'?[]:(await db.prepare('SELECT id,code,name,platform FROM crm_attribution_campaigns ORDER BY name,id').all()).results;
  return {campaigns,rows:rows.map(r=>({...r,can_open:manages||r.owner_id===user.id,followed:!!r.last_contact&&r.last_contact>=r.updated,payload:JSON.parse(r.payload)})),manages,today,todayPool,assigned,todoCount:todo.length,todo:todo.slice(0,100),firstContactCount:firstContact.length,firstContact:firstContact.slice(0,100),timezone:'Australia/Sydney',ai:false};
 }
 if(path==='customer-pool/submit'&&method==='POST'){
  if(!can(user,'customers_edit'))fail('没有提交客户的权限',403);
  if(user.id!==actor.id)fail('请切回本人视角提交客户',403);
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(body.id||''))fail('提交编号无效，请刷新页面');
  if(!SOURCES.includes(body.source))fail('请选择客资来源');
  const raw=clean(body.raw,12000);if(!raw)fail('请粘贴客户原始消息或填写资料来源');
  const existing=await db.prepare('SELECT id,created_by,source,raw FROM crm_customer_pool WHERE id=?').bind(body.id).first<any>();
  if(existing){if(existing.created_by!==actor.id||existing.source!==body.source||existing.raw!==raw)fail('提交编号已使用，请刷新页面核对原记录后重新提交',409);return {ok:true,id:existing.id};}
  await db.batch([
   db.prepare("INSERT INTO crm_customer_pool(id,source,raw,payload,created,updated,created_by) VALUES(?,?,?,?,?,?,?)").bind(body.id,body.source,raw,JSON.stringify(fields(body.fields)),timestamp,timestamp,actor.id),
   event(db,body.id,actor.id,'提交客户',{source:body.source})
  ]);return {ok:true,id:body.id};
 }
 if(!manages)fail('只有具有全公司客户查看及分配权限的人员可以核查客户池',403);
 if(path==='customer-pool/retry'&&method==='POST'){await processCustomerPool(db);return {ok:true};}
 const row=await db.prepare('SELECT * FROM crm_customer_pool WHERE id=?').bind(clean(body.id,100)).first<any>();
 if(!row)fail('客户池记录不存在',404);
 if(path==='customer-pool/review'&&method==='POST')return {candidates:await matches(db,fields(body.fields)),events:(await db.prepare('SELECT e.kind,e.payload,e.created,u.name AS actor_name FROM crm_pool_events e JOIN crm_users u ON u.id=e.actor_id WHERE e.intake_id=? ORDER BY e.created,e.rowid').bind(row.id).all<any>()).results};
 if(path==='customer-pool/save'&&method==='POST'){
  if(row.state!=='待确认'||row.version!==body.version)fail('记录已变化，请刷新后核查',409);
  const data=fields(body.fields),result=await db.batch([
   db.prepare("UPDATE crm_customer_pool SET payload=?,updated=?,version=version+1 WHERE id=? AND state='待确认' AND version=?").bind(JSON.stringify(data),timestamp,row.id,body.version),
   event(db,row.id,actor.id,'保存待确认资料',{before:JSON.parse(row.payload),after:data})
  ]);if(!result[0].meta.changes)fail('记录已变化，请刷新后核查',409);return {ok:true,version:row.version+1};
 }
 if(path==='customer-pool/confirm'&&method==='POST'){
  if(row.state!=='待确认'||row.version!==body.version)fail('记录已变化，请刷新后核查',409);
  const data=fields(body.fields),scope=BUSINESS_SCOPES.find(s=>s.id===data.business_scope);
  if(!data.name||(!phoneKey(data.phone)&&!emailKey(data.email)))fail('请补充姓名及至少一种有效联系方式');
  if(data.phone&&phoneKey(data.phone).length<7)fail('电话号码不足7位，请核对');
  if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))fail('邮箱格式不正确，请核对');
  if(!scope||scope.source!==row.source)fail('请选择与来源对应的业务范围');
  if(!data.requirement)fail('请补充客户需求；不清楚时填写“需求待补充”');
  if(data.source_kind&&!SOURCE_KINDS.includes(data.source_kind as any))fail('请选择获客来源类型');
  if(data.source_kind==='广告活动'&&!await db.prepare('SELECT id FROM crm_attribution_campaigns WHERE id=?').bind(data.campaign_id).first())fail('请选择有效的广告活动');
  if(data.source_kind!=='广告活动'&&data.campaign_id)fail('非广告来源不能设置广告活动');
  if(data.source_kind&&data.source_kind!=='未知来源'&&!data.attribution_reason)fail('请填写获客来源的核查依据');
  const candidates=await matches(db,data),target=clean(body.target_lead_id,100),reason=clean(body.reason,1000);
  if(target&&!reason)fail('请填写关联原客户的确认依据');
  if(target){const lead=await db.prepare('SELECT l.owner_id,u.active FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id WHERE l.id=?').bind(target).first<any>();if(!lead?.owner_id||!lead.active)fail('原客户负责人无效，请先处理交接');}
  else if(candidates.length&&!reason)fail('有相同联系方式，请选择原客户，或填写确为不同客户的依据');
  const already=await db.prepare('SELECT id FROM crm_leads WHERE id=?').bind(row.id).first();
  if(already)fail('客资已建立，请在客资管理中处理核查或归属，不能重复确认',409);
  const payload={...data,distinct_reason:!target?reason:''};
  const result=await db.batch([
   db.prepare("UPDATE crm_customer_pool SET payload=?,target_lead_id=?,state='待分配',confirmed_by=?,updated=?,last_error='',version=version+1 WHERE id=? AND state='待确认' AND version=?").bind(JSON.stringify(payload),target||null,actor.id,timestamp,row.id,body.version),
   event(db,row.id,actor.id,'确认资料',{before:JSON.parse(row.payload),after:payload,target_lead_id:target||null,reason})
  ]);if(!result[0].meta.changes)fail('记录已变化，请刷新后核查',409);
  await processCustomerPool(db);return {ok:true};
 }
 fail('客户池操作不存在',404);
}

// Derive local midnight from Intl rather than assuming a fixed UTC offset across DST.
function dayBounds(date:string){
 const midnight=Date.parse(date+'T00:00:00Z');
 const boundary=(value:number)=>{let guess=value;for(let i=0;i<3;i++){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(guess));guess+=value-Date.parse(parts.replace(' ','T')+'Z');}return new Date(guess).toISOString();};
 return [boundary(midnight),boundary(midnight+86400000)];
}
