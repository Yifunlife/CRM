import {can,canSetManagement,authorizedLead,id,now} from './crm';
import {boardLeadVisible} from './market-access';
import {accountTradeScopes,isSalesPerson,accountSalesCompany} from './account-classification';
import {customerMarket} from './operations-dashboard';
import {followupAssignee} from './order-followup-server';
import {AllocationError} from './allocation-server';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
export async function projectResponsibilityEndpoint(db:D1Database,user:any,actor:any,method:string,body:any,url:URL,prepare?:{details:Record<string,any>;token:string;at:string}){
 const key=method==='GET'?url.searchParams.get('id'):body?.id;
 const project:any=typeof key==='string'?await db.prepare('SELECT * FROM crm_sales_projects WHERE project_id=?').bind(key).first():null;
 const lead:any=project?await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(project.lead_id).first():null;
 if(!lead||!authorizedLead(user,lead)||!boardLeadVisible(user,lead))fail('项目不存在或无权查看',404);
 const details=JSON.parse(project.details||'{}'),linked:any=await db.prepare("SELECT id FROM crm_followup_orders WHERE deal_id=?").bind(details.deal_id||'').first();
 const editable=canSetManagement(user)&&canSetManagement(actor)&&user.id===actor.id&&!user.personal_business&&can(user,'customers_all')&&!linked;
 const users=(await db.prepare('SELECT id,name,role,active,trade_scopes,permissions FROM crm_users ORDER BY name').all<any>()).results;
 const market=accountSalesCompany({id:lead.owner_id||''})||JSON.parse(lead.detail||'{}')._sales_company?'外贸':customerMarket(lead);
 const sales=users.filter(p=>p.active&&isSalesPerson(p)&&accountTradeScopes(p).includes(market==='内贸'?'domestic':'foreign'));
 const followup=[];if(editable)for(const person of users.filter(p=>p.active))if(await followupAssignee(db,person))followup.push(person);
 const owner=users.find(p=>p.id===lead.owner_id),assistant=users.find(p=>p.id===details.assistant_id),assigned=users.find(p=>p.id===details.followup_id);
 if(method==='GET')return {owner_id:lead.owner_id||'',owner_name:owner?.name||'',assistant_id:details.assistant_id||'',assistant_name:assistant?.name||'',followup_id:details.followup_id||'',followup_name:assigned?.name||'',version:project.version,can_edit:editable,can_assign_owner:!lead.owner_id&&lead.cohort==='historical',order_id:linked?.id||'',sales:editable?sales.map(p=>({id:p.id,name:p.name})):[],followup:followup.map(p=>({id:p.id,name:p.name}))};
 if(method!=='POST')fail('操作不存在',405);
 if(!editable)fail('仅本人登录的分配管理人员可维护未建立订单跟单的项目人员',403);
 if(body.version!==project.version||(body.base_owner_id||'')!==(lead.owner_id||''))fail('项目人员已变化，请刷新后重试',409);
 if(typeof body.owner_id!=='string'||typeof body.followup_id!=='string')fail('请选择有效人员');
 const ownerId=body.owner_id,followupId=body.followup_id,assistantId=body.assistant_id===undefined?details.assistant_id||'':body.assistant_id;
 if(typeof assistantId!=='string')fail('请选择有效辅业务');
 if(lead.owner_id&&ownerId!==lead.owner_id)fail('已有业务员的客户请通过正式转交流程更换，避免覆盖客户归属');
 if(!lead.owner_id&&ownerId){
  if(lead.cohort!=='historical')fail('新增客资请通过分配管理分配业务员');
  if(!sales.some(p=>p.id===ownerId))fail('请选择符合项目内外贸范围的在职业务员');
  if(await db.prepare('SELECT id FROM crm_deals WHERE lead_id=?').bind(lead.id).first())fail('客户已有成交记录，请通过正式归属核正处理');
 }
 if(assistantId){
  if(!ownerId)fail('请先指定主业务，再选择辅业务');
  if(assistantId===ownerId)fail('主业务和辅业务不能选择同一人');
  if(!sales.some(p=>p.id===assistantId))fail('请选择符合项目内外贸范围的在职辅业务');
 }
 if(followupId&&!followup.some(p=>p.id===followupId))fail('请选择有跟单维护权限的在职人员');
 const changed=ownerId!==(lead.owner_id||'')||assistantId!==(details.assistant_id||'')||followupId!==(details.followup_id||'');
 if(!changed&&!prepare)return {ok:true};
 const token=prepare?.token||id(),at=prepare?.at||now(),next={...(prepare?.details||details),assistant_id:assistantId,followup_id:followupId},statements=[db.prepare("UPDATE crm_sales_projects SET details=?,version=version+1,token=?,updated=?,updated_by=? WHERE project_id=? AND version=? AND token=? AND EXISTS(SELECT 1 FROM crm_leads WHERE id=? AND owner_id IS ?) AND NOT EXISTS(SELECT 1 FROM crm_followup_orders WHERE deal_id=?) AND (?=0 OR (EXISTS(SELECT 1 FROM crm_leads WHERE id=? AND cohort='historical') AND NOT EXISTS(SELECT 1 FROM crm_deals WHERE lead_id=?)))").bind(JSON.stringify(next),token,at,actor.id,project.project_id,project.version,project.token,lead.id,lead.owner_id,details.deal_id||'',!lead.owner_id&&ownerId?1:0,lead.id,lead.id)];
 if(!lead.owner_id&&ownerId){
  statements.push(db.prepare('UPDATE crm_leads SET owner_id=? WHERE id=? AND owner_id IS NULL AND EXISTS(SELECT 1 FROM crm_sales_projects WHERE project_id=? AND token=?)').bind(ownerId,lead.id,project.project_id,token));
  statements.push(db.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,business_scope,allocation_month,policy) SELECT ?,?,?,?,?,?,?,'historical-alignment' WHERE EXISTS(SELECT 1 FROM crm_sales_projects WHERE project_id=? AND token=?)").bind(id(),lead.id,actor.id,ownerId,at,lead.business_scope,at.slice(0,7),project.project_id,token));
 }
 if(changed)statements.push(db.prepare("INSERT INTO crm_sales_events(id,project_id,lead_id,kind,payload,occurred_at,created,created_by) SELECT ?,?,?,'分配项目人员',?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_sales_projects WHERE project_id=? AND token=?)").bind(id(),project.project_id,lead.id,JSON.stringify({before:{owner_id:lead.owner_id||'',assistant_id:details.assistant_id||'',followup_id:details.followup_id||''},after:{owner_id:ownerId,assistant_id:assistantId,followup_id:followupId}}),at,at,actor.id,project.project_id,token));
 if(prepare)return {statements,changed};
 const result=await db.batch(statements);if(!result[0].meta.changes)fail('项目人员已变化，请刷新后重试',409);
 return {ok:true};
}
