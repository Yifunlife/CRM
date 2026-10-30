import { prepareContractArchive } from '../contract-archive';
import { can,id,now } from '../crm';
import { executionQuote } from '../execution-quote-source';
import { blankSteps } from '../order-followup';
import { followupAssignee } from '../order-followup-server';
import type { ConfirmationContext } from './context';
import { fail,required } from './errors';
function notice(db:D1Database,order:string,key:string,title:string,content:string,recipient:string){return db.prepare("INSERT OR IGNORE INTO crm_followup_notifications(id,dedupe_key,order_id,recipient_id,title,content,created) SELECT ?,?,o.id,u.id,?,?,? FROM crm_followup_orders o JOIN crm_users u ON u.id=? AND u.active=1 WHERE o.id=?").bind(id(),'confirmation:'+key+':'+recipient,title,content,now(),recipient,order);}
async function ownProject(db:D1Database,u:any,key:string){const p:any=await db.prepare('SELECT p.*,l.owner_id FROM crm_sales_projects p JOIN crm_leads l ON l.id=p.lead_id WHERE p.project_id=?').bind(key).first();if(!p||p.owner_id!==u.id||!can(u,'customers_edit'))fail('只有本项目所属业务员可以确认',403);return p;}
export async function contractConfirmation({db,source,u,actor,path,method,b,stores}:ConfirmationContext){
 if(path==='confirmations/contract'&&method==='POST'){
  const p=await ownProject(db,u,b.project_id),old:any=await db.prepare('SELECT order_id FROM crm_contract_confirmations WHERE project_id=?').bind(p.project_id).first();if(old)return {ok:true,id:old.order_id};
  if(b.version!==p.version)fail('项目已更新，请刷新',409);
  if(!await db.prepare('SELECT id FROM crm_sales_quote_links WHERE project_id=? AND (quote_id=? OR EXISTS(SELECT 1 FROM crm_quote_acceptances a WHERE a.project_id=crm_sales_quote_links.project_id AND a.quote_id=?))').bind(p.project_id,b.quote_id,b.quote_id).first())fail('报价不属于本项目');
  const sourceData=await executionQuote(db,source,u,b.quote_id),follower:any=await db.prepare('SELECT * FROM crm_users WHERE id=? AND active=1').bind(b.logistics_id).first();
  if(!follower||!await followupAssignee(db,follower))fail('请选择有效跟单负责人');
  const evidence=required(b.reason,'合同确认依据'),time=now(),order=id(),deal=id();
  if(await db.prepare('SELECT id FROM crm_followup_orders WHERE order_number=?').bind(sourceData.contract_no).first())fail('已有同编号订单，请核对原订单，不会重复创建',409);
  const existingDeal:any=await db.prepare('SELECT * FROM crm_deals WHERE order_number=?').bind(sourceData.contract_no).first();if(existingDeal&&(existingDeal.lead_id!==p.lead_id||existingDeal.owner_id!==u.id||existingDeal.cancelled))fail('已有成交归属不一致，请核对',409);
  if(existingDeal){const original:any=await db.prepare('SELECT currency,total_minor FROM crm_workflow_contracts WHERE deal_id=?').bind(existingDeal.id).first();if(original&&(original.currency!==sourceData.currency||original.total_minor!==sourceData.amount_minor))fail('原成交合同金额与本次报价不一致，请先核对',409);}
  const lead:any=await db.prepare('SELECT business_scope FROM crm_leads WHERE id=? AND owner_id=?').bind(p.lead_id,u.id).first();if(!lead?.business_scope)fail('客户业务范围待补齐');
  const archive=await prepareContractArchive(db,source!,stores,order,b.quote_id,sourceData.files,actor.id);
  const details={dates:{},contract_source:{...sourceData,files:archive.files,evidence,confirmed_by:actor.id,confirmed_at:time},supply_scope:sourceData.supply_scope,payment_nodes:sourceData.payment_terms};
  const statements:D1PreparedStatement[]=[db.prepare('UPDATE crm_sales_projects SET details=CASE WHEN version=? AND EXISTS(SELECT 1 FROM crm_leads WHERE id=crm_sales_projects.lead_id AND owner_id=?) THEN details ELSE NULL END,version=version+1 WHERE project_id=?').bind(b.version,u.id,p.project_id)];
  if(!existingDeal)statements.push(db.prepare('INSERT INTO crm_deals(id,order_number,lead_id,owner_id,business_scope,deal_date,created,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(deal,sourceData.contract_no,p.lead_id,u.id,lead.business_scope,new Date(time).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),time,actor.id));
  statements.push(db.prepare('INSERT OR IGNORE INTO crm_workflow_contracts(deal_id,currency,total_minor,schedule,updated,updated_by) VALUES(?,?,?,?,?,?)').bind(existingDeal?.id||deal,sourceData.currency,sourceData.amount_minor,'[]',time,actor.id));
  statements.push(db.prepare('INSERT INTO crm_followup_orders(id,order_number,project,lead_id,deal_id,commercial_id,logistics_id,details,steps,change_token,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(order,sourceData.contract_no,p.name,p.lead_id,existingDeal?.id||deal,u.id,follower.id,JSON.stringify(details),JSON.stringify(blankSteps()),id(),time,actor.id,time,actor.id),db.prepare('INSERT INTO crm_contract_confirmations VALUES(?,?,?,?,?)').bind(p.project_id,order,b.quote_id,actor.id,time),db.prepare("INSERT INTO crm_followup_events(id,order_id,kind,payload,created,created_by) VALUES(?,?,'合同确认自动建单',?,?,?)").bind(id(),order,JSON.stringify({project_id:p.project_id,source:sourceData,reason:evidence}),time,actor.id));
  statements.push(db.prepare("UPDATE crm_sales_projects SET stage='won',stage_at=?,amount_minor=?,currency=?,details=json_set(details,'$.deal_id',?),updated=?,updated_by=? WHERE project_id=?").bind(time,sourceData.amount_minor,sourceData.currency,existingDeal?.id||deal,time,actor.id,p.project_id));
  statements.push(notice(db,order,'contract:'+p.project_id,'合同已确认，订单已建立',p.name+'｜请在订单跟单查看合同档案及执行要求',follower.id));
  try{await db.batch([...statements,...archive.statements]);}catch(e){await archive.cleanup();throw e;}return {ok:true,id:order};
 }
 if(path==='confirmations/followers'&&method==='GET'){
  const users=(await db.prepare("SELECT id,name,role,permissions FROM crm_users WHERE active=1").all<any>()).results;const rows=[];for(const person of users)if(await followupAssignee(db,person))rows.push({id:person.id,name:person.name});return {rows};
 }
}
