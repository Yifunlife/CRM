import {assignmentFields,assignmentJoin} from './assignment-reminders';
import {assignmentCategory} from './assignment-categories';
import {can} from './crm';
import {AllocationError} from './allocation-server';
import {suiteDay} from './sales-suite';
export function deliveredDate(order:any){const acceptance=order.details?.execution?.stages?.acceptance;return acceptance?.status==='已完成'?acceptance.values?.date||'':'';}
export function followupPerformance(rows:any[],userId:string,month:string){
 const contracts=new Map<string,number>(),delivered=new Map<string,number>(),seen=new Set<string>();
 for(const r of rows){if(r.logistics_id!==userId||r.cancelled||r.total_minor==null||seen.has(r.deal_id))continue;seen.add(r.deal_id);contracts.set(r.currency,(contracts.get(r.currency)||0)+r.total_minor);if(deliveredDate(r).startsWith(month))delivered.set(r.currency,(delivered.get(r.currency)||0)+r.total_minor);}
 const amounts=(m:Map<string,number>)=>Array.from(m,([currency,amount])=>({currency,amount}));return {month,contracts:amounts(contracts),delivered:amounts(delivered)};
}
export async function roleWorkspaceEndpoint(db:D1Database,u:any,path:string,method:string,url:URL){
 if(!['role-home','sales-amounts'].includes(path))return undefined;
 if(method!=='GET')throw new AllocationError('只支持读取',405);
 const leader=['admin','ceo','management'].includes(u.role)&&can(u,'customers_all');
 if(!leader)throw new AllocationError('没有管理页面权限',403);
 if(path==='sales-amounts'){
  const month=url.searchParams.get('month')||suiteDay().slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new AllocationError('月份无效',400);
  const rows=(await db.prepare(`SELECT d.id,d.lead_id,d.owner_id,u.name AS owner_name,d.order_number,l.name AS customer_name,c.currency,c.total_minor,
   EXISTS(SELECT 1 FROM crm_receipts r WHERE r.deal_id=d.id AND r.cancelled=0 AND r.currency<>c.currency) AS mixed_currency,
   (SELECT COALESCE(SUM(r.amount_minor),0) FROM crm_receipts r WHERE r.deal_id=d.id AND r.cancelled=0 AND r.currency=c.currency)-
   (SELECT COALESCE(SUM(f.amount_minor),0) FROM crm_workflow_refunds f JOIN crm_receipts r ON r.id=f.receipt_id WHERE r.deal_id=d.id AND r.cancelled=0 AND r.currency=c.currency) AS received_minor
   FROM crm_deals d JOIN crm_leads l ON l.id=d.lead_id LEFT JOIN crm_users u ON u.id=d.owner_id LEFT JOIN crm_workflow_contracts c ON c.deal_id=d.id WHERE d.cancelled=0 AND substr(d.deal_date,1,7)=? ORDER BY d.deal_date DESC,d.id`).bind(month).all<any>()).results;
  return {month,rows};
 }
 const todos:any[]=[];
 if(can(u,'leads_allocate')||u.role==='admin'){const rows=(await db.prepare("SELECT id,name,source,created FROM crm_leads WHERE owner_id IS NULL AND review=0 AND cohort='new' AND original_owner='' ORDER BY created").all<any>()).results;for(const r of rows)todos.push({id:'assign:'+r.id,kind:'待分配',name:r.name,owner:r.source,reason:'尚无负责人',date:r.created,lead_id:r.id,page:'工作台',action:'分配'});}
 const projects=(await db.prepare("SELECT p.project_id,p.lead_id,p.name,p.blocker,p.next_date,p.next_action,u.name AS owner_name FROM crm_sales_projects p JOIN crm_leads l ON l.id=p.lead_id LEFT JOIN crm_users u ON u.id=l.owner_id WHERE p.stage NOT IN ('won','lost') AND (trim(p.blocker)<>'' OR (p.next_date<>'' AND p.next_date<?))").bind(suiteDay()).all<any>()).results;
 for(const p of projects)todos.push({id:'project:'+p.project_id,kind:p.blocker?.trim()?'需协调':'需督办',name:p.name,owner:p.owner_name,reason:p.blocker||'跟进逾期 · '+p.next_action,date:p.next_date,project_id:p.project_id,lead_id:p.lead_id,action:p.blocker?.trim()?'协调':'督办'});
 const waiting=(await db.prepare(`SELECT l.id,l.name,l.owner_id,u.name AS owner_name,${assignmentFields} FROM crm_leads l JOIN crm_users u ON u.id=l.owner_id ${assignmentJoin} WHERE l.review=0 AND l.status NOT IN ('暂停跟进','已结束','已成交') AND a.created IS NOT NULL AND date(a.created,'+8 hours')<? AND NOT EXISTS(SELECT 1 FROM crm_notes n WHERE n.lead_id=l.id AND n.user_id=l.owner_id AND n.created>=a.created AND trim(n.content)<>'' AND n.method NOT IN ('归属核正','表单咨询','系统导入','自动分配','系统收信'))`).bind(suiteDay()).all<any>()).results;
 for(const l of waiting)if(assignmentCategory(l)==='new')todos.push({id:'waiting:'+l.id,kind:'需督办',name:l.name,owner:l.owner_name,reason:'此前分配后仍无跟进记录',date:l.assigned_at,lead_id:l.id,action:'督办'});
 const reviews=(await db.prepare("SELECT e.id,e.lead_id,e.payload,l.name FROM crm_sales_events e JOIN crm_leads l ON l.id=e.lead_id WHERE e.kind='申请归属复核' AND NOT EXISTS(SELECT 1 FROM crm_sales_events r WHERE r.kind='归属复核结论' AND json_extract(r.payload,'$.review_id')=e.id)").all<any>()).results;
 for(const r of reviews)todos.push({id:'review:'+r.id,kind:'待确认',name:r.name,reason:JSON.parse(r.payload).reason,lead_id:r.lead_id,page:'客户经营',action:'核实'});
 const handovers=(await db.prepare("SELECT h.*,l.name FROM crm_workflow_handovers h LEFT JOIN crm_leads l ON h.kind='customer' AND l.id=h.entity_id WHERE h.state='待接收' AND h.to_id=?").bind(u.id).all<any>()).results;
 for(const h of handovers)todos.push({id:'handover:'+h.id,kind:'待确认',name:h.name||'交接事项',reason:h.reason,date:h.created,page:'我的交接',action:'接收'});
 if(u.role==='ceo'){const rows=(await db.prepare("SELECT r.id,r.reason,r.created,r.order_id,o.project FROM crm_release_requests r JOIN crm_followup_orders o ON o.id=r.order_id WHERE r.state='pending' AND o.archived=0 AND r.commercial_revision=o.commercial_revision").all<any>()).results;for(const r of rows)todos.push({id:'release:'+r.id,kind:'待确认',name:r.project,reason:r.reason,date:r.created,order_id:r.order_id,action:'审批'});}
 return {todos};
}
