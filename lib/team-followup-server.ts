import {can,now} from './crm';
import {AllocationError} from './allocation-server';
import {teamCustomer,teamStaff} from './team-followup';

export async function teamFollowupEndpoint(db:D1Database,user:any,path:string,method:string){
 if(path!=='team-followup')return undefined;
 if(!can(user,'customers_all')||user.role==='sales')throw new AllocationError('此页面用于管理层查看团队跟进',403);
 if(method!=='GET')throw new AllocationError('跟进汇总只支持读取',405);
 const at=now();
 // Only real communication counts. Imports, assignment corrections and incoming enquiries are not outbound follow-up.
 const human="n.method IN ('WhatsApp','邮件','电话','其他','首次WhatsApp','首次邮件','二次WhatsApp','二次邮件','客户回复')";
 const [leads,people]=await Promise.all([
  db.prepare(`SELECT l.*,
   (SELECT MAX(n.created) FROM crm_notes n WHERE n.lead_id=l.id AND ${human}) AS human_contact,
   (SELECT n.content FROM crm_notes n WHERE n.lead_id=l.id AND ${human} ORDER BY n.created DESC,n.rowid DESC LIMIT 1) AS last_note,
   (SELECT n.next_step FROM crm_notes n WHERE n.lead_id=l.id AND ${human} ORDER BY n.created DESC,n.rowid DESC LIMIT 1) AS next_step,
   (SELECT MAX(event_time) FROM (SELECT s.occurred AS event_time FROM crm_form_submissions s WHERE s.lead_id=l.id AND s.kind='repeat' UNION ALL SELECT p.created FROM crm_customer_pool p WHERE p.target_lead_id=l.id AND p.state='已入CRM')) AS inquiry_at,
   (SELECT COUNT(*) FROM crm_deals d WHERE d.lead_id=l.id AND d.cancelled=0) AS deal_count
   FROM crm_leads l WHERE l.review=0 AND l.owner_id IS NOT NULL`).all<any>(),
  db.prepare("SELECT id,name,active FROM crm_users WHERE (active=1 AND role IN ('sales','management','ceo')) OR EXISTS(SELECT 1 FROM crm_leads l WHERE l.owner_id=crm_users.id AND l.review=0) ORDER BY name,id").all<any>()
 ]);
 const rows=leads.results.map(l=>teamCustomer(l,at));
 const priorityOrders=(await db.prepare("SELECT o.id,o.order_number,o.project,o.lead_id,u.name AS owner_name,o.details FROM crm_followup_orders o JOIN crm_users u ON u.id=o.commercial_id WHERE o.archived=0 AND json_extract(o.details,'$.priority.at') IS NOT NULL ORDER BY json_extract(o.details,'$.priority.at') DESC,o.id").all<any>()).results.map(o=>({...o,priority:JSON.parse(o.details).priority}));
 return {priorityOrders,at,timezone:'Australia/Sydney',rows,people:teamStaff(people.results,rows)};
}
