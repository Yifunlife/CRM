import {assignmentReminders} from './assignment-reminders';
import {AllocationError} from './allocation-server';
import {now} from './crm';
import {salesDay} from './sales-pipeline';
import {homeCustomer,sortHomeCustomers} from './sales-home';

// This endpoint is deliberately personal, including for sales accounts with company-wide visibility.
export async function salesHomeEndpoint(db:D1Database,user:any,path:string,method:string){
 if(path!=='sales-home')return undefined;
 if(user.role!=='sales')throw new AllocationError('此首页仅用于业务员本人工作',403);
 if(method!=='GET')throw new AllocationError('首页只支持读取',405);
 const at=now(),today=salesDay(at),month=today.slice(0,7);
 const [leadResult,dealResult,taskResult,handoverResult,performance,receipts,refunds,assignments]=await Promise.all([
  db.prepare(`SELECT l.*,
   (SELECT MAX(a.created) FROM crm_assignments a WHERE a.lead_id=l.id AND a.owner_id=l.owner_id) AS assigned_at,
   (SELECT n.content FROM crm_notes n WHERE n.lead_id=l.id ORDER BY n.created DESC,n.rowid DESC LIMIT 1) AS last_note,
   (SELECT n.next_step FROM crm_notes n WHERE n.lead_id=l.id ORDER BY n.created DESC,n.rowid DESC LIMIT 1) AS next_step,
   (SELECT MAX(p.updated) FROM crm_customer_pool p WHERE p.lead_id=l.id AND p.state='已入CRM' AND (l.last_contact='' OR p.updated>l.last_contact)) AS inquiry_at
   FROM crm_leads l WHERE l.owner_id=?`).bind(user.id).all<any>(),
  db.prepare(`SELECT d.id,d.lead_id,EXISTS(SELECT 1 FROM crm_followup_orders o WHERE o.deal_id=d.id) AS has_order FROM crm_deals d JOIN crm_leads l ON l.id=d.lead_id WHERE l.owner_id=? AND d.cancelled=0`).bind(user.id).all<any>(),
  db.prepare(`SELECT t.id,t.title,t.next_action,t.due_at,t.next_followup,t.owner_id,u.name AS owner_name,o.order_number FROM crm_followup_tasks t JOIN crm_followup_orders o ON o.id=t.order_id JOIN crm_users u ON u.id=t.owner_id WHERE t.status='待处理' AND o.archived=0 AND (t.owner_id=? OR o.commercial_id=?) ORDER BY t.due_at,t.id`).bind(user.id,user.id).all<any>(),
  db.prepare(`SELECT h.id,h.kind,h.reason,h.to_id,h.created,a.name AS from_name,b.name AS to_name FROM crm_workflow_handovers h JOIN crm_users a ON a.id=h.from_id JOIN crm_users b ON b.id=h.to_id WHERE h.state='待接收' AND (h.to_id=? OR h.from_id=?) ORDER BY h.created,h.id`).bind(user.id,user.id).all<any>(),
  db.prepare(`SELECT COUNT(*) AS deals,COALESCE(SUM(c.deal_id IS NULL),0) AS unpriced FROM crm_deals d LEFT JOIN crm_workflow_contracts c ON c.deal_id=d.id WHERE d.owner_id=? AND d.cancelled=0 AND substr(d.deal_date,1,7)=?`).bind(user.id,month).first<any>(),
  db.prepare(`SELECT r.currency,SUM(r.amount_minor) AS amount FROM crm_receipts r JOIN crm_deals d ON d.id=r.deal_id WHERE d.owner_id=? AND d.cancelled=0 AND r.cancelled=0 AND substr(r.received_date,1,7)=? GROUP BY r.currency`).bind(user.id,month).all<any>(),
  db.prepare(`SELECT r.currency,SUM(f.amount_minor) AS amount FROM crm_workflow_refunds f JOIN crm_receipts r ON r.id=f.receipt_id JOIN crm_deals d ON d.id=r.deal_id WHERE d.owner_id=? AND d.cancelled=0 AND r.cancelled=0 AND substr(f.refunded_date,1,7)=? GROUP BY r.currency`).bind(user.id,month).all<any>(),
  assignmentReminders(db,user)
 ]);
 const contracts=(await db.prepare(`SELECT c.currency,SUM(c.total_minor) AS amount FROM crm_workflow_contracts c JOIN crm_deals d ON d.id=c.deal_id WHERE d.owner_id=? AND d.cancelled=0 AND substr(d.deal_date,1,7)=? GROUP BY c.currency`).bind(user.id,month).all<any>()).results;
 const dealMap=new Map<string,any[]>();for(const deal of dealResult.results){const list=dealMap.get(deal.lead_id)||[];list.push(deal);dealMap.set(deal.lead_id,list);}
 const categories=new Map(assignments.map(l=>[l.id,l.assignment_category]));
 const rows=leadResult.results.map(lead=>homeCustomer({...lead,assignment_category:categories.get(lead.id)},at,dealMap.get(lead.id)||[]));
 const historicalIds=new Set(assignments.filter(l=>l.assignment_category!=='new').map(l=>l.id));
 const tasks=taskResult.results.map(t=>({...t,mine:t.owner_id===user.id,due:t.due_at?salesDay(t.due_at):'',next_date:t.next_followup?salesDay(t.next_followup):''}));
 return {at,today,month,timezone:'Asia/Shanghai',customer_count:rows.length,
  todos:rows.filter(r=>r.tags.length&&(!historicalIds.has(r.id)||r.tags.some(t=>['inquiry','today','overdue'].includes(t)))).sort(sortHomeCustomers),historical_review_count:historicalIds.size,
  projects:rows.filter(r=>['replied','design','negotiation'].includes(r.stage)||(r.stage==='unverified'&&r.status==='正在沟通')||r.handover_pending>0).sort((a,b)=>Number(b.handover_pending>0)-Number(a.handover_pending>0)||sortHomeCustomers(a,b)),
  tasks,handovers:handoverResult.results.map(h=>({...h,incoming:h.to_id===user.id})),
  performance:{...performance,contracts,receipts:receipts.results,refunds:refunds.results}
 };
}
