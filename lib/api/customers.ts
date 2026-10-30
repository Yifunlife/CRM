import {customerPage} from '../customer-page';
import { assignmentCategory } from '../assignment-categories';
import { assignmentFields,assignmentJoin } from '../assignment-reminders';
import { closingOutcome } from '../attribution-server';
import { authorizedLead,can,clean,GRADES,id,now,STATUSES } from '../crm';
import { customerChange,customerChanges } from '../customer-changes';
import { validateLeadFollowup } from '../workflow-server';
import type { ApiContext } from './context';
import { json,Problem } from './http';
export async function customerRecords({db,req,path,write,body,user,actor}:ApiContext):Promise<Response|undefined>{
  if(path==='leads-page'&&!write)return json(await customerPage(db,user,new URL(req.url)));
  const scope = !can(user,'customers_all') ? " WHERE l.owner_id=?" : "";
  if (path === "leads" && !write) {
   const result = await db.prepare(`SELECT l.*,${assignmentFields},CASE WHEN EXISTS(SELECT 1 FROM crm_deals d WHERE d.lead_id=l.id AND d.cancelled=0) THEN 'existing' ELSE 'new' END AS customer_type,u.name AS owner_name FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id ${assignmentJoin}${scope} ORDER BY l.created DESC,l.id LIMIT 10000`).bind(...(scope ? [user.id] : [])).all(); return json(result.results.map((r: any) => ({...r,assignment_category:assignmentCategory(r),detail:JSON.parse(r.detail)})));
  }
  if (path.startsWith("leads/") && !write) {
   const lead: any = await db.prepare(`SELECT l.*,${assignmentFields},CASE WHEN EXISTS(SELECT 1 FROM crm_deals d WHERE d.lead_id=l.id AND d.cancelled=0) THEN 'existing' ELSE 'new' END AS customer_type,u.name AS owner_name FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id ${assignmentJoin} WHERE l.id=?`).bind(path.split("/")[1]).first();
   if (!lead || !authorizedLead(user,lead)) throw new Problem("客资不存在或无权查看",404);
   const notes = await db.prepare("SELECT n.*,u.name AS author FROM crm_notes n JOIN crm_users u ON u.id=n.user_id WHERE lead_id=? ORDER BY n.created DESC,n.rowid DESC").bind(lead.id).all(); const deals=await db.prepare("SELECT d.*,u.name AS owner_name FROM crm_deals d JOIN crm_users u ON u.id=d.owner_id WHERE d.lead_id=? ORDER BY deal_date DESC,created DESC").bind(lead.id).all();const receipts=await db.prepare('SELECT r.* FROM crm_receipts r JOIN crm_deals d ON d.id=r.deal_id WHERE d.lead_id=? ORDER BY received_date DESC,r.created DESC').bind(lead.id).all();return json({...lead,assignment_category:assignmentCategory(lead),detail:JSON.parse(lead.detail),notes:notes.results,deals:deals.results,receipts:receipts.results,changes:await customerChanges(db,user,can(user,'customers_all'),lead.id)});
  }
  if (path === "followup" && req.method === "POST") {
   const lead: any = await db.prepare("SELECT * FROM crm_leads WHERE id=?").bind(body.id).first();
   if (!lead || !authorizedLead(user,lead)) throw new Problem("客资不存在或无权操作",404);
   if (!STATUSES.includes(body.status) || !clean(body.content)) throw new Problem("请填写跟进结果并选择状态");
   await validateLeadFollowup(db,lead,body);
   const date = clean(body.next_date,10); if(date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Problem("跟进日期格式不正确");
   const outcomeStatements=await closingOutcome(db,lead,body,actor);
   await db.batch([...outcomeStatements,customerChange(db,actor,lead.id,'status',body.status,clean(body.content)),db.prepare("INSERT INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES(?,?,?,?,?,?,?)").bind(id(),lead.id,actor.id,clean(body.content)+(body.status==='暂停跟进'?'\n暂停原因：'+clean(body.pause_reason):''),clean(body.method,40),clean(body.next_step),now()),db.prepare("UPDATE crm_leads SET status=?,next_date=?,last_contact=? WHERE id=?").bind(body.status,date,now(),lead.id)]);return json({ok:true});
  }
  if (path === "grade" && req.method === "POST") {
   const lead: any = await db.prepare("SELECT owner_id FROM crm_leads WHERE id=?").bind(body.id).first();
   if (!lead || !authorizedLead(user,lead)) throw new Problem("客资不存在或无权操作",404);
   if (!["",...GRADES].includes(body.grade)) throw new Problem("请选择VIP、A、B、C或未评级");
   await db.batch([customerChange(db,actor,body.id,'grade',body.grade),db.prepare("UPDATE crm_leads SET grade=? WHERE id=?").bind(body.grade,body.id)]);return json({ok:true});
  }
}
