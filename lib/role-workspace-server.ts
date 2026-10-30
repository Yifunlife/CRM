import {can,authorizedLead,id,now,GRADES} from './crm';
import {PROCESS_STATUSES,FOLLOWUP_NODES} from './followup-board';
import {paymentSummary} from './workflow-server';
import {AllocationError} from './allocation-server';
import {customerMarket} from './operations-dashboard';
import {quoteAccount} from './sales-quote-source';
import {suiteDay,CLOSED_STAGES} from './sales-suite';
import {deliveryStage,sumCurrencies,PROCESS_FIELDS,DELIVERY_STAGES} from './role-workspace';
import {followupOrder,writeFollowup} from './order-followup-server';
const list=async(db:D1Database,sql:string,args:any[]=[]) => (await db.prepare(sql).bind(...args).all<any>()).results;
const parse=(s:string)=>JSON.parse(s||'{}');
const fail=(s:string,status=400):never=>{throw new AllocationError(s,status);};
const text=(v:any,max=2000)=>typeof v==='string'&&v.trim().length<=max?v.trim():fail('填写内容格式无效或过长');
export async function roleWorkspaceEndpoint(db:D1Database,u:any,actor:any,path:string,method:string,body:any,url:URL,source?:D1Database){
 if(path==='role-workspace/report'){
  if(method!=='GET')fail('看板仅支持读取',405);
  const personal=u.role==='sales',all=!personal&&['admin','ceo','management'].includes(u.role)&&can(u,'customers_all');
  if(!personal&&!all)fail('没有销售看板权限',403);
  const month=url.searchParams.get('month')||suiteDay().slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail('月份无效');
  const market=url.searchParams.get('market')||'内贸';if(!['内贸','外贸','待确认'].includes(market))fail('内外贸分类无效');const currency=market==='内贸'?'CNY':market==='外贸'?'USD':'';
  const where=all?'1=1':'l.owner_id=?',args=all?[]:[u.id];
  const [rawLeads,rawProjects,rawDeals,rawQuotes,rawOrders,rawInquiries,people,rawReceipts]=await Promise.all([
   list(db,`SELECT l.id,l.name,l.owner_id,l.grade,l.status,l.created,l.country,l.source,l.business_scope FROM crm_leads l WHERE ${where}`,args),
   list(db,`SELECT p.*,l.name AS customer_name,l.owner_id,l.country,l.source,l.business_scope FROM crm_sales_projects p JOIN crm_leads l ON l.id=p.lead_id WHERE ${where}`,args),
   list(db,`SELECT d.*,l.name AS customer_name,l.country,l.source,l.business_scope AS lead_scope,c.currency,c.total_minor FROM crm_deals d JOIN crm_leads l ON l.id=d.lead_id LEFT JOIN crm_workflow_contracts c ON c.deal_id=d.id WHERE d.cancelled=0 AND ${all?'1=1':'d.owner_id=?'}`,args),
   list(db,`SELECT q.*,p.lead_id,l.owner_id,l.country,l.source,l.business_scope FROM crm_sales_quote_links q JOIN crm_sales_projects p ON p.project_id=q.project_id JOIN crm_leads l ON l.id=p.lead_id WHERE ${where}`,args),
   list(db,`SELECT o.*,l.country,l.source,l.business_scope,l.name AS customer_name,c.name AS commercial_name,s.name AS logistics_name FROM crm_followup_orders o JOIN crm_leads l ON l.id=o.lead_id JOIN crm_users c ON c.id=o.commercial_id JOIN crm_users s ON s.id=o.logistics_id WHERE ${all?'1=1':'o.commercial_id=? AND l.owner_id=?'}`,all?[]:[u.id,u.id]),
   list(db,`SELECT p.id,p.created,l.owner_id,l.country,l.source,l.business_scope FROM crm_customer_pool p JOIN crm_leads l ON l.id=COALESCE(p.target_lead_id,p.lead_id) WHERE ${where} AND substr(p.created,1,7)=?`,[...args,month]),
   list(db,`SELECT id,name,active FROM crm_users WHERE ${all?"role IN ('sales','ceo','management') OR EXISTS(SELECT 1 FROM crm_leads l WHERE l.owner_id=crm_users.id) OR EXISTS(SELECT 1 FROM crm_deals d WHERE d.owner_id=crm_users.id)":'id=?'} ORDER BY name`,args),
   list(db,`SELECT r.*,COALESCE((SELECT SUM(f.amount_minor) FROM crm_workflow_refunds f WHERE f.receipt_id=r.id),0) AS refunded_minor FROM crm_receipts r JOIN crm_deals d ON d.id=r.deal_id WHERE r.cancelled=0 AND d.cancelled=0 AND ${all?'1=1':'d.owner_id=?'}`,args)
  ]);
  const classify=(row:any)=>customerMarket({...row,business_scope:row.business_scope||row.lead_scope});
  const pick=(rows:any[])=>rows.filter(r=>classify(r)===market);
  const leads=pick(rawLeads),projects=pick(rawProjects),deals=pick(rawDeals),quotes=pick(rawQuotes),orders=pick(rawOrders),inquiries=pick(rawInquiries);
  const pending_classification=rawLeads.filter(l=>classify(l)==='待确认').length;
  const ps=projects.map(p=>({...p,details:parse(p.details)})),os=orders.map(o=>({...o,details:parse(o.details),steps:parse(o.steps)})).map(o=>({...o,delivery_stage:deliveryStage(o)}));
  const monthly=deals.filter(d=>d.deal_date.startsWith(month)).map(d=>{const receipts=rawReceipts.filter(r=>r.deal_id===d.id),mismatch=receipts.some(r=>r.currency!==d.currency),received=receipts.filter(r=>r.currency===d.currency).reduce((n,r)=>n+r.amount_minor-r.refunded_minor,0);return {...d,received_minor:mismatch||!d.currency?null:received,outstanding_minor:mismatch||d.total_minor==null?null:d.total_minor-received,receipt_currency_mismatch:mismatch};});
  let qrows=quotes.map(q=>({...q,summary:parse(q.summary)})).filter(q=>q.summary.available);
  if(personal){let account='';try{account=await quoteAccount(db,source,u);}catch{}const allowed=[];for(const q of qrows){if(q.summary.bridge_shared||account&&q.summary.source_owner===account&&await source!.prepare('SELECT id FROM quotation_history WHERE id=? AND created_by=?').bind(q.quote_id,account).first())allowed.push(q);}qrows=allowed;}
  const forecast=ps.filter(p=>!CLOSED_STAGES.includes(p.stage)&&p.expected_date?.startsWith(month));
  const summary=(owner?:string)=>{
   const ls=leads.filter(l=>!owner||l.owner_id===owner),p=ps.filter(p=>!owner||p.owner_id===owner),o=os.filter(o=>!owner||o.commercial_id===owner),ds=monthly.filter(d=>!owner||d.owner_id===owner),qs=qrows.filter(q=>!owner||q.owner_id===owner),fs=forecast.filter(p=>!owner||p.owner_id===owner);
   const won=new Set(deals.filter(d=>!owner||d.owner_id===owner).map(d=>d.lead_id));
   const keys=new Set(p.map(p=>p.details.deal_id?'deal:'+p.details.deal_id:p.customer_project_id?'project:'+p.customer_project_id:'sales:'+p.project_id));for(const order of o)keys.add(order.deal_id?'deal:'+order.deal_id:'order:'+order.id);
   const quoteProjects=new Set(qs.map(q=>q.project_id));
   return {customers:ls.length,projects:keys.size,grades:Object.fromEntries([...GRADES,''].map(g=>[g||'未评级',ls.filter(l=>(l.grade||'')===g).length])),new_inquiries:inquiries.filter(i=>!owner||i.owner_id===owner).length,following:ls.filter(l=>['已联系待回复','正在沟通'].includes(l.status)).length,won_customers:ls.filter(l=>won.has(l.id)).length,lost:ls.filter(l=>l.status==='已结束'&&!won.has(l.id)).length,quote_count:quoteProjects.size,quoted:sumCurrencies(qs.map(q=>q.summary).filter(q=>q.currency===currency),'amount_minor'),quote_unknown:qs.filter(q=>q.summary.amount_minor==null).length,forecast:sumCurrencies(fs.filter(p=>p.currency===currency),'amount_minor'),forecast_unknown:fs.filter(p=>p.amount_minor==null).length,won:sumCurrencies(ds.filter(d=>d.currency===currency),'total_minor'),unpriced:ds.filter(d=>d.total_minor==null).length,deal_count:ds.length,currency_mismatches:qs.filter(q=>q.summary.amount_minor!=null&&q.summary.currency!==currency).length+fs.filter(p=>p.amount_minor!=null&&p.currency!==currency).length+ds.filter(d=>d.total_minor!=null&&d.currency!==currency).length,target:null};
  };
  return {market,currency,pending_classification,month,at:now(),personal,summary:summary(personal?u.id:undefined),people:people.map(p=>({...p,...summary(p.id)})),projects:ps,orders:os,deals:monthly,quotes:qrows.map(q=>({id:q.id,project_id:q.project_id,owner_id:q.owner_id,lead_id:q.lead_id,summary:q.summary,sync_error:q.sync_error})),forecast};
 }
 if(path==='role-workspace/customer'&&method==='POST'){
  if(!can(u,'customers_edit')||u.role==='ceo')fail('没有客户维护权限',403);
  const lead:any=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(body.id).first();if(!lead||!authorizedLead(u,lead))fail('客户不存在或无权维护',404);
  const before=parse(lead.detail);if(body.revision!==(before._profile_revision||0))fail('客户资料已变化，请刷新',409);
  if(!Array.isArray(body.contacts)||body.contacts.length>30)fail('联系人最多30位');
  const contacts=body.contacts.map((c:any)=>({name:text(c.name,200),role:text(c.role||'',200),phone:text(c.phone||'',100),email:text(c.email||'',200)}));if(contacts.some((c:any)=>!c.name))fail('请填写联系人姓名');
  const country=text(body.country,100),method=text(body.method,100),sourceNote=text(body.source_note||'',1000);
  const after={...before,_profile_revision:(before._profile_revision||0)+1,_contacts:contacts,'偏好联系方式':method,'客户来源说明':sourceNote};
  const results=await db.batch([db.prepare('UPDATE crm_leads SET country=?,detail=? WHERE id=? AND detail=? AND owner_id IS ?').bind(country,JSON.stringify(after),lead.id,lead.detail,lead.owner_id),db.prepare('INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(id(),'更新客户档案',lead.id,JSON.stringify({before:{country:lead.country,contacts:before._contacts,method:before['偏好联系方式'],source_note:before['客户来源说明']},after:{country,contacts,method,source_note:sourceNote}}),now(),actor.id)]);
  if(!results[0].meta.changes)fail('客户资料或归属已变化，请刷新',409);return {ok:true};
 }
 const match=path.match(/^followup\/orders\/([^/]+)\/business-process$/);
 if(match&&method==='POST'){
  const {row,manager}=await followupOrder(db,u,match[1]);if(!manager||u.role==='ceo')fail('没有本单跟单维护权限',403);if(row.archived)fail('已归档订单不可修改');
  const fields=PROCESS_FIELDS[body.page];if(!fields)fail('流程节点无效');const values:Record<string,string>={};for(const key of fields)values[key]=text(body.values?.[key]||'');
  const next=text(body.next);if(!next)fail('请填写下一步与处理安排');if(!['project','toy'].includes(body.purchase_kind))fail('请选择项目下单或玩具下单');
  const businessStage=body.business_stage||row.details.business_stage||deliveryStage(row);if(!DELIVERY_STAGES.includes(businessStage)||businessStage==='已完成'&&deliveryStage(row)!=='已完成')fail('完成状态由交付及归档流程确认');
  const previous=row.details.business_process?.[body.page]||{};
  const archiving=body.archive===true;if(archiving&&body.page!=='跟进收款')fail('请在收款归档环节完成归档');
  const status=archiving?'已完成':body.status??previous.status??'进行中';if(!PROCESS_STATUSES.includes(status))fail('请选择有效环节状态');if(status==='不适用'&&['接单确认','出货交付','跟进收款'].includes(body.page))fail('该关键环节不能设为不适用');
  if(!archiving&&body.page==='跟进收款'&&['已完成','不适用'].includes(status))fail('收款归档须通过原收款确认及订单归档流程完成');
  const ownerId=body.owner_id??previous.owner_id??row.logistics_id;if(typeof ownerId!=='string'||!await db.prepare('SELECT id FROM crm_users WHERE id=? AND active=1').bind(ownerId).first())fail('请选择有效负责人');
  const due=body.due??previous.due??'';if(typeof due!=='string'||due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due))||new Date(due).toISOString().slice(0,10)!==due))fail('请填写有效计划日期');
  if(archiving){
   if(FOLLOWUP_NODES.slice(0,-1).some(n=>!['已完成','不适用'].includes(row.details.business_process?.[n.page]?.status)))fail('请先核对完成前面的全部环节');
   if(!Array.isArray(body.archive_checks)||body.archive_checks.length!==4||new Set(body.archive_checks).size!==4||body.archive_checks.some((n:any)=>!Number.isInteger(n)||n<0||n>3))fail('请逐项核对归档清单');
   if(await db.prepare("SELECT id FROM crm_followup_tasks WHERE order_id=? AND status='待处理' LIMIT 1").bind(row.id).first())fail('仍有未解决待办或异常，不能归档');
   const flow=row.details.execution,free=flow?.profile?.charge==='free'&&row.details.contract_source?.amount_minor===0;
   if(free){if(Object.entries(flow.stages||{}).some(([key,value]:[string,any])=>key!=='archive'&&value.status!=='已完成')||flow.stages?.release?.status!=='已完成')fail('免费订单须先核对适用的批准及执行记录');}
   else {
    if(!row.deal_id||!await db.prepare('SELECT id FROM crm_deals WHERE id=? AND lead_id=? AND cancelled=0').bind(row.deal_id,row.lead_id).first())fail('请先关联并确认有效成交订单及实际收款');
    const payment=await paymentSummary(db,row.deal_id);if(!payment.contract||payment.contract.total_minor<=0||payment.cross_currency||payment.outstanding_minor!==0||payment.net_minor!==payment.contract.total_minor)fail('合同金额、实际收款或币种尚未核对结清，不能归档');
   }
  }
  if(status==='已完成'){
   if(fields.some(k=>!values[k]))fail('完成本环节前请填写全部核对项，不适用的内容请注明原因');
   const node=FOLLOWUP_NODES.find(n=>n.page===body.page)!;
   if(await db.prepare("SELECT id FROM crm_followup_tasks WHERE order_id=? AND step=? AND status='待处理' LIMIT 1").bind(row.id,node.step).first())fail('本环节仍有未解决待办，请先处理');
  }
  const details={...row.details,purchase_kind:body.purchase_kind,business_stage:businessStage,business_process:{...row.details.business_process,[body.page]:{...previous,values,next,status,owner_id:ownerId,due,...(archiving?{archive_checks:body.archive_checks}:{}),at:now(),by:actor.id}}};
  return writeFollowup(db,row,body,actor,archiving?'订单归档':'更新'+body.page,{page:body.page,mode:archiving?'流程总表':undefined,before:row.details.business_process?.[body.page]||null,after:details.business_process[body.page],business_stage:businessStage,purchase_kind:body.purchase_kind},()=>[],{...row,details,archived:archiving?1:row.archived});
 }
 return undefined;
}
