import {authorizedLead,can,id,now} from './crm';
import {boardLeadVisible} from './market-access';
import {followupOrder} from './order-followup-server';
import {projectOverviewFacts} from './project-overview';
import {AllocationError} from './allocation-server';

const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
const text=(value:unknown,max:number)=>typeof value==='string'&&value.trim().length<=max?value.trim():fail('填写内容无效或过长');
export async function projectProfileEndpoint(db:D1Database,user:any,actor:any,method:string,body:any,url:URL){
 if(!['GET','POST'].includes(method))fail('请求方式无效',405);
 const key=method==='GET'?url.searchParams.get('entity'):body?.entity;
 if(typeof key!=='string'||!/^(sales|order):[^:]+$/.test(key)||key.length>150)fail('项目不存在或无权查看',404);
 const [type,keyId]=key.split(':');
 let project:any=type==='sales'?await db.prepare('SELECT * FROM crm_sales_projects WHERE project_id=?').bind(keyId).first():null;
 let order:any=type==='order'?(await followupOrder(db,user,keyId)).row:null;
 if(project){project={...project,details:JSON.parse(project.details)};if(project.details.deal_id){const linked:any=await db.prepare('SELECT id FROM crm_followup_orders WHERE deal_id=? AND lead_id=?').bind(project.details.deal_id,project.lead_id).first();if(linked)order=(await followupOrder(db,user,linked.id)).row;}}
 const row=order||project;
 const lead:any=row?await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(row.lead_id).first():null;
 if(!lead||!authorizedLead(user,lead)||!boardLeadVisible(user,lead))fail('项目不存在或无权查看',404);
 if(order&&!project&&order.deal_id){const linked:any=await db.prepare("SELECT * FROM crm_sales_projects WHERE lead_id=? AND json_extract(details,'$.deal_id')=?").bind(lead.id,order.deal_id).first();if(linked)project={...linked,details:JSON.parse(linked.details)};}
 const manager=['admin','ceo','management'].includes(user.role)&&can(user,'customers_all')&&!user.personal_business;
 const editable=user.id===actor.id&&user.active!==0&&!row.archived&&(order?manager||(await followupOrder(db,user,order.id)).manager:manager||can(user,'customers_edit'));
 const facts=projectOverviewFacts({...row,country:lead.country},order?project:undefined);
 const values={contractNumber:facts.contractNumber,projectAddress:facts.projectAddress,area:facts.area,height:facts.height};
 const canonical=order?'order:'+order.id:'sales:'+project.project_id;
 // Existing order numbers and confirmed contract sources stay with their original workflow.
 const contractLocked=!!order||!!row.details.contract_source;
 if(method==='GET')return {entity:canonical,version:row.version,values,can_edit:editable,contract_locked:contractLocked};
 if(!editable)fail('没有项目资料维护权限',403);
 if(body.version!==row.version)fail('项目资料已被更新，请刷新后重试',409);
 if(!body.values||typeof body.values!=='object'||Array.isArray(body.values))fail('项目资料格式无效');
 const next={contractNumber:text(body.values.contractNumber,200),projectAddress:text(body.values.projectAddress,1500),area:text(body.values.area,100),height:text(body.values.height,100)};
 for(const name of ['area','height'] as const)if(next[name]&&(!Number.isFinite(Number(next[name]))||Number(next[name])<=0))fail(name==='area'?'面积须填写大于0的平方米数':'层高须填写大于0的米数');
 if(contractLocked&&next.contractNumber!==values.contractNumber)fail('合同号来自已确认合同或订单，请在原合同资料中维护');
 if(JSON.stringify(next)===JSON.stringify(values))return {ok:true};
 const details={...row.details,qualification:{...row.details.qualification}};
 if(!order)details.contract_no=next.contractNumber;
 if(order)details.project_address=next.projectAddress;
 else if(Object.hasOwn(details,'project_address'))details.project_address=next.projectAddress;
 const fields=order?[['area_m2','area'],['height_m','height']]:[['project_address','projectAddress'],['area_m2','area'],['height_m','height']];
 for(const [field,name] of fields){const value=next[name as keyof typeof next],previous=details.qualification[field];if(previous?.value!==value)details.qualification[field]={...previous,value,state:'pending',evidence:''};}
 const table=order?'crm_followup_orders':'crm_sales_projects',column=order?'id':'project_id',tokenColumn=order?'change_token':'token',token=id(),at=now();
 const update=db.prepare(`UPDATE ${table} SET details=?,version=version+1,${tokenColumn}=?,updated=?,updated_by=? WHERE ${column}=? AND version=? AND ${tokenColumn}=? AND EXISTS(SELECT 1 FROM crm_leads WHERE id=? AND owner_id IS ?)`)
  .bind(JSON.stringify(details),token,at,actor.id,order?order.id:project.project_id,row.version,row[tokenColumn],lead.id,lead.owner_id);
 const payload=JSON.stringify({entity:canonical,before:values,after:next});
 const audit=order?db.prepare("INSERT INTO crm_followup_events(id,order_id,kind,payload,created,created_by) SELECT ?,?,'项目资料更新',?,?,? WHERE EXISTS(SELECT 1 FROM crm_followup_orders WHERE id=? AND change_token=?)").bind(id(),order.id,payload,at,actor.id,order.id,token)
  :db.prepare("INSERT INTO crm_sales_events(id,project_id,lead_id,kind,payload,occurred_at,created,created_by) SELECT ?,?,?,'项目资料更新',?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_sales_projects WHERE project_id=? AND token=?)").bind(id(),project.project_id,lead.id,payload,at,at,actor.id,project.project_id,token);
 const result=await db.batch([update,audit]);if(!result[0].meta.changes)fail('项目资料或归属已变化，请刷新后重试',409);
 return {ok:true};
}
