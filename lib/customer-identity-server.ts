import {AllocationError} from './allocation-server';
import {id,now,clean,can,authorizedLead} from './crm';
import {followupManager} from './order-followup-server';
import {identityHints} from './customer-identity';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
const required=(v:any,label:string,max=2000)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail('请填写'+label+'（不超过'+max+'字）');return v.trim();};
const admin=(user:any,actor:any)=>{if(user.role!=='admin'||actor.role!=='admin')fail('只有管理员可以确认客户主体及关联',403);};
const tables:Record<string,{table:string;key:string;source:string}>={lead:{table:'crm_customer_project_leads',key:'lead_id',source:'crm_leads'},deal:{table:'crm_customer_project_deals',key:'deal_id',source:'crm_deals'},order:{table:'crm_customer_project_orders',key:'order_id',source:'crm_followup_orders'}};
const messages=['原主体关联仍存在，请先人工解除，不自动合并','请先人工解除该咨询及订单的项目关联','咨询和项目必须属于同一已确认客户主体','成交和项目必须属于同一已确认客户主体','跟单和项目必须属于同一已确认客户主体','成交与对应跟单须关联同一项目'];
function event(db:D1Database,actor:any,subject:string|null,kind:string,payload:any,conditional=true){return db.prepare('INSERT INTO crm_customer_identity_events(id,subject_id,kind,payload,created,created_by) SELECT ?,?,?,?,?,?'+(conditional?' WHERE changes()>0':'')).bind(id(),subject,kind,JSON.stringify(payload),now(),actor.id);}
async function lead(db:D1Database,user:any,key:any){const row:any=typeof key==='string'?await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(key).first():null;if(!row||!authorizedLead(user,row))fail('咨询不存在或无权查看',404);return row;}
async function subject(db:D1Database,user:any,key:any){const row:any=typeof key==='string'?await db.prepare('SELECT * FROM crm_customer_subjects WHERE id=?').bind(key).first():null;if(!row||user.role!=='admin'&&!await db.prepare('SELECT 1 FROM crm_customer_subject_links s JOIN crm_leads l ON l.id=s.lead_id WHERE s.subject_id=?'+(can(user,'customers_all')?'':' AND l.owner_id=?')+' LIMIT 1').bind(key,...(can(user,'customers_all')?[]:[user.id])).first())fail('客户主体不存在或无权查看',404);return row;}
async function report(db:D1Database,user:any){
 const all=can(user,'customers_all'),where=all?'':' WHERE l.owner_id=?',args=all?[]:[user.id],isAdmin=user.role==='admin';
 const leads=(await db.prepare('SELECT l.id,l.name,l.country,l.phone,l.email,l.detail,l.source,l.original_owner,l.owner_id,u.name AS owner_name,l.status,s.subject_id FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id LEFT JOIN crm_customer_subject_links s ON s.lead_id=l.id'+where+' ORDER BY l.created DESC,l.id').bind(...args).all<any>()).results.map(l=>({...l,detail:JSON.parse(l.detail)}));
 const leadIds=new Set(leads.map(l=>l.id)),subjectIds=new Set(leads.map(l=>l.subject_id).filter(Boolean));
 const deals=(await db.prepare('SELECT d.id,d.order_number,d.lead_id,d.cancelled,d.deal_date,u.name AS owner_name FROM crm_deals d JOIN crm_leads l ON l.id=d.lead_id LEFT JOIN crm_users u ON u.id=d.owner_id'+where).bind(...args).all<any>()).results;
 const orderAll=can(user,'followup_all')||await followupManager(db,user);
 const orders=orderAll||user.role==='sales'?(await db.prepare('SELECT o.id,o.order_number,o.lead_id,o.deal_id,o.archived FROM crm_followup_orders o JOIN crm_leads l ON l.id=o.lead_id WHERE '+(all?'1=1':'l.owner_id=?')+(orderAll?'':' AND o.commercial_id=?')).bind(...args,...(orderAll?[]:[user.id])).all<any>()).results:[];
 const subjects=(await db.prepare('SELECT * FROM crm_customer_subjects ORDER BY created DESC,id').all<any>()).results.filter(s=>isAdmin||subjectIds.has(s.id)).map(s=>{const linked=leads.filter(l=>l.subject_id===s.id),ids=new Set(linked.map(l=>l.id)),count=deals.filter(d=>ids.has(d.lead_id)&&!d.cancelled).length;return {id:s.id,code:s.code,kind:s.kind,name:isAdmin?s.name:linked[0]?.name,country:isAdmin?s.country:linked[0]?.country,contacts:isAdmin?JSON.parse(s.contacts):[],version:isAdmin?s.version:undefined,lead_count:linked.length,deal_count:count,repurchase:count>=2};});
 const visible:Record<string,Set<string>>={lead:leadIds,deal:new Set(deals.map(d=>d.id)),order:new Set(orders.map(o=>o.id))};
 const projectLinks:any[]=[];
 for(const [kind,spec] of Object.entries(tables)){const rows=(await db.prepare('SELECT * FROM '+spec.table).all<any>()).results;for(const r of rows)if(visible[kind].has(r[spec.key]))projectLinks.push({kind,entity_id:r[spec.key],project_id:r.project_id});}
 const projectIds=new Set(projectLinks.map(l=>l.project_id));
 const projects=(await db.prepare('SELECT id,subject_id,name,version FROM crm_customer_projects ORDER BY created,id').all<any>()).results.filter(p=>isAdmin||subjectIds.has(p.subject_id)&&projectIds.has(p.id));
 const reviews=(await db.prepare('SELECT r.*,u.name AS proposer FROM crm_customer_identity_reviews r JOIN crm_users u ON u.id=r.created_by ORDER BY r.updated DESC,r.id').all<any>()).results.filter(r=>leadIds.has(r.lead_id)&&(!r.other_lead_id||leadIds.has(r.other_lead_id))&&(!r.subject_id||subjectIds.has(r.subject_id)||isAdmin)).map(({token,...r})=>r);
 const events=isAdmin?(await db.prepare('SELECT e.*,u.name AS actor_name FROM crm_customer_identity_events e JOIN crm_users u ON u.id=e.created_by ORDER BY e.created DESC,e.rowid DESC LIMIT 200').all<any>()).results:[];
 return {leads,deals,orders,subjects,projects,projectLinks,reviews,events};
}
export async function customerIdentityEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 if(!path.startsWith('identity/'))return undefined;
 try{return await endpoint(db,user,actor,path,method,body);}catch(e:any){const message=messages.find(m=>String(e.message).includes(m)||String(e.cause?.message).includes(m));if(message)fail(message,409);if(String(e.message).includes('UNIQUE constraint failed: crm_customer_'))fail('关联已存在或已变化，请刷新核查；不自动覆盖',409);throw e;}
}
async function endpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any):Promise<any>{
 if(path==='identity/report'&&method==='GET')return report(db,user);
 if(method!=='POST')fail('操作不存在',404);
 if(!body||typeof body!=='object'||Array.isArray(body))fail('请求格式无效');
 if(path==='identity/candidates'){
  const source=await lead(db,user,body.lead_id),data=await report(db,user);source.detail=JSON.parse(source.detail);
  return {candidates:data.leads.filter((l:any)=>l.id!==source.id).map((l:any)=>({id:l.id,name:l.name,source:l.source,owner_name:l.owner_name,subject_id:l.subject_id,hints:identityHints(source,l)})).filter((l:any)=>l.hints.length),state:'待核查'};
 }
 if(path==='identity/reviews'){
  if(!can(user,'customers_edit'))fail('此账号无权提交核查建议',403);
  await lead(db,user,body.lead_id);if(body.other_lead_id){if(body.other_lead_id===body.lead_id)fail('请选择不同咨询');await lead(db,user,body.other_lead_id);}if(body.subject_id)await subject(db,user,body.subject_id);
  const key=id(),reason=required(body.reason,'核查建议及依据'),time=now();
  await db.batch([db.prepare('INSERT INTO crm_customer_identity_reviews(id,lead_id,other_lead_id,subject_id,proposal,created,created_by,updated,updated_by,token) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(key,body.lead_id,body.other_lead_id||null,body.subject_id||null,reason,time,actor.id,time,actor.id,id()),event(db,actor,body.subject_id||null,'提交待核查',{review_id:key,lead_id:body.lead_id,other_lead_id:body.other_lead_id||null,reason})]);return {ok:true,id:key};
 }
 admin(user,actor);
 const reason=required(body.reason,'确认依据／变更原因');
 if(path==='identity/subjects'){
  if(!['企业','个人'].includes(body.kind))fail('请选择企业或个人');
  const name=required(body.name,'主体确认名称',200),country=clean(body.country,100);
  if(!Array.isArray(body.contacts)||body.contacts.length>30)fail('联系人最多30位');
  const contacts=body.contacts.map((c:any)=>({name:required(c?.name,'联系人名称',100),phone:clean(c.phone,100),email:clean(c.email,200)}));
  const time=now(),old=body.id?await subject(db,user,body.id):null,key=old?.id||id();
  if(old&&!Number.isInteger(body.version))fail('请刷新主体资料后重试',409);
  const stmt=old?db.prepare('UPDATE crm_customer_subjects SET kind=?,name=?,country=?,contacts=?,version=version+1,updated=?,updated_by=? WHERE id=? AND version=?').bind(body.kind,name,country,JSON.stringify(contacts),time,actor.id,key,body.version):db.prepare('INSERT INTO crm_customer_subjects(id,code,kind,name,country,contacts,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(key,'KH-'+key.toUpperCase(),body.kind,name,country,JSON.stringify(contacts),time,actor.id,time,actor.id);
  const results=await db.batch([stmt,event(db,actor,key,old?'修改主体资料':'建立客户主体',{before:old,after:{kind:body.kind,name,country,contacts},reason})]);if(!results[0].meta.changes)fail('主体已更新，请刷新',409);return {ok:true,id:key};
 }
 if(path==='identity/link'||path==='identity/unlink'){
  await lead(db,user,body.lead_id);await subject(db,user,body.subject_id);
  const old:any=await db.prepare('SELECT * FROM crm_customer_subject_links WHERE lead_id=?').bind(body.lead_id).first();
  if(path.endsWith('/link')){if(old)fail('此咨询已有关联，请核查；更换主体须先人工解除',409);await db.batch([db.prepare('INSERT INTO crm_customer_subject_links(lead_id,subject_id,reason,created,created_by) VALUES(?,?,?,?,?)').bind(body.lead_id,body.subject_id,reason,now(),actor.id),event(db,actor,body.subject_id,'人工关联咨询',{lead_id:body.lead_id,reason})]);}
  else{const r=await db.batch([db.prepare('DELETE FROM crm_customer_subject_links WHERE lead_id=? AND subject_id=?').bind(body.lead_id,body.subject_id),event(db,actor,body.subject_id,'解除咨询关联',{before:old,reason})]);if(!r[0].meta.changes)fail('关联已变化，请刷新',409);}
  return {ok:true};
 }
 if(path==='identity/reviews/resolve'){
  const review:any=await db.prepare('SELECT * FROM crm_customer_identity_reviews WHERE id=?').bind(body.id).first();if(!review)fail('核查建议不存在',404);
  if(!['确认同一客户','确认不同客户','继续待核查'].includes(body.decision))fail('请选择核查结论');
  if(body.decision==='确认不同客户'){
   if(!review.other_lead_id&&!review.subject_id)fail('此建议没有比较对象，请继续待核查或确认关联');
   const a:any=await db.prepare('SELECT subject_id FROM crm_customer_subject_links WHERE lead_id=?').bind(review.lead_id).first(),b:any=review.other_lead_id?await db.prepare('SELECT subject_id FROM crm_customer_subject_links WHERE lead_id=?').bind(review.other_lead_id).first():null;
   if(a&&(review.other_lead_id?a.subject_id===b?.subject_id:a.subject_id===review.subject_id))fail('目前仍关联同一主体，请先人工解除误关联，再确认不同客户',409);
  }
  if(!Number.isInteger(body.version))fail('请刷新核查记录后重试',409);
  let target:string|null=review.subject_id;const links:D1PreparedStatement[]=[];const token=id();
  if(body.decision==='确认同一客户'){
   await subject(db,user,body.subject_id);target=body.subject_id;
   for(const leadId of [review.lead_id,review.other_lead_id].filter(Boolean)){
    await lead(db,user,leadId);const old:any=await db.prepare('SELECT subject_id FROM crm_customer_subject_links WHERE lead_id=?').bind(leadId).first();if(old&&old.subject_id!==target)fail('咨询已关联其他主体，请先人工核查并解除，不自动合并',409);
    links.push(db.prepare('INSERT INTO crm_customer_subject_links(lead_id,subject_id,reason,created,created_by) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_customer_identity_reviews WHERE id=? AND token=?) ON CONFLICT(lead_id) DO UPDATE SET subject_id=excluded.subject_id').bind(leadId,target,reason,now(),actor.id,review.id,token));
   }
  }
  const state=body.decision==='继续待核查'?'待核查':body.decision;
  const results=await db.batch([db.prepare('UPDATE crm_customer_identity_reviews SET state=?,decision=?,version=version+1,token=?,updated=?,updated_by=? WHERE id=? AND version=?').bind(state,reason,token,now(),actor.id,review.id,body.version),...links,db.prepare('INSERT INTO crm_customer_identity_events(id,subject_id,kind,payload,created,created_by) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_customer_identity_reviews WHERE id=? AND token=?)').bind(id(),target,body.decision,JSON.stringify({before:review,subject_id:target,reason}),now(),actor.id,review.id,token)]);
  if(!results[0].meta.changes)fail('核查记录已更新，请刷新',409);return {ok:true};
 }
 if(path==='identity/projects'){
  await subject(db,user,body.subject_id);const name=required(body.name,'项目名称',200),time=now(),key=body.id||id();
  const old:any=body.id?await db.prepare('SELECT * FROM crm_customer_projects WHERE id=? AND subject_id=?').bind(key,body.subject_id).first():null;if(body.id&&!old)fail('项目不存在',404);
  if(old&&!Number.isInteger(body.version))fail('请刷新项目资料后重试',409);
  const stmt=old?db.prepare('UPDATE crm_customer_projects SET name=?,version=version+1,updated=?,updated_by=? WHERE id=? AND version=?').bind(name,time,actor.id,key,body.version):db.prepare('INSERT INTO crm_customer_projects(id,subject_id,name,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,?,?)').bind(key,body.subject_id,name,time,actor.id,time,actor.id);
  const r=await db.batch([stmt,event(db,actor,body.subject_id,old?'修改项目名称':'建立客户项目',{before:old,project_id:key,name,reason})]);if(!r[0].meta.changes)fail('项目已更新，请刷新',409);return {ok:true,id:key};
 }
 if(path==='identity/project-link'||path==='identity/project-unlink'){
  const spec=tables[body.kind];if(!spec)fail('关联类型无效');
  const project:any=await db.prepare('SELECT * FROM crm_customer_projects WHERE id=?').bind(body.project_id).first();if(!project)fail('项目不存在',404);
  const row:any=await db.prepare('SELECT * FROM '+spec.source+' WHERE id=?').bind(body.entity_id).first();if(!row)fail('原记录不存在',404);
  const link=path.endsWith('/project-link'),old=await db.prepare('SELECT * FROM '+spec.table+' WHERE '+spec.key+'=?'+(body.kind==='lead'?' AND project_id=?':'')).bind(body.entity_id,...(body.kind==='lead'?[project.id]:[])).first();
  if(link&&old)fail('此记录已有关联，请先核查或人工解除',409);
  const stmt=link?db.prepare('INSERT INTO '+spec.table+'('+ (body.kind==='lead'?'id,':'')+spec.key+',project_id,reason,created,created_by) VALUES('+ (body.kind==='lead'?'?,':'')+'?,?,?,?,?)').bind(...(body.kind==='lead'?[id()]:[]),body.entity_id,project.id,reason,now(),actor.id):db.prepare('DELETE FROM '+spec.table+' WHERE '+spec.key+'=? AND project_id=?').bind(body.entity_id,project.id);
  const r=await db.batch([stmt,event(db,actor,project.subject_id,link?'人工关联项目':'解除项目关联',{kind:body.kind,entity_id:body.entity_id,project_id:project.id,before:old,reason})]);if(!r[0].meta.changes)fail('项目关联已变化，请刷新',409);return {ok:true};
 }
 fail('操作不存在',404);
}
