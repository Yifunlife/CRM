import {assignmentReminders} from './assignment-reminders';
import {can,id,now} from './crm';
import {AllocationError} from './allocation-server';
import {orderReminders} from './order-followup';
import {chinaDay} from './followup-phase1';
import {followupOrder} from './order-followup-server';

export async function refreshFollowupNotifications(db:D1Database,at=now(),orderId=''){
 const users=(await db.prepare('SELECT id,role,permissions FROM crm_users WHERE active=1').all<any>()).results;
 const active=new Set(users.map(u=>u.id)),leaders=users.filter(u=>can(u,'followup_all')).map(u=>u.id);
 const orders=(await db.prepare('SELECT * FROM crm_followup_orders WHERE archived=0'+(orderId?' AND id=?':'')).bind(...(orderId?[orderId]:[])).all<any>()).results;
 const tasks=(await db.prepare("SELECT t.* FROM crm_followup_tasks t JOIN crm_followup_orders o ON o.id=t.order_id WHERE o.archived=0 AND t.status='待处理'"+(orderId?' AND o.id=?':'')).bind(...(orderId?[orderId]:[])).all<any>()).results;
 // Operations update notices; calendar due notices are created by the daily scan.
 const existing=new Set(orderId?(await db.prepare("SELECT dedupe_key FROM crm_followup_notifications WHERE order_id=? AND resolved_at=''").bind(orderId).all<any>()).results.map(n=>n.dedupe_key):[]);
 const today=chinaDay(at),notices:any[]=[];
 const access=new Map<string,Set<string>>();
 const add=(o:any,key:string,title:string,content:string,recipients:string[],due=false)=>{for(const recipient of new Set(recipients.filter(r=>active.has(r)&&access.get(o.id)?.has(r)))){const noticeKey=o.id+':'+key+':'+recipient;if(orderId&&due&&!existing.has(noticeKey))continue;notices.push({key:noticeKey,order_id:o.id,recipient,title,content:o.project+'｜'+o.order_number+'\n'+content});}};
 for(const raw of orders){
  const o={...raw,details:JSON.parse(raw.details),steps:JSON.parse(raw.steps)};
  const eligible=new Set<string>(),candidates=new Set<string>([o.logistics_id,o.commercial_id,o.details.delegate_id,...leaders,...tasks.filter(t=>t.order_id===o.id).map(t=>t.owner_id),...Object.values(o.details.business_process||{}).map((n:any)=>n.owner_id)].filter(Boolean));
  for(const recipient of candidates){if(!active.has(recipient))continue;try{await followupOrder(db,{id:recipient},o.id);eligible.add(recipient);}catch(e){if(!(e instanceof AllocationError)||![403,404].includes(e.status))throw e;}}
  access.set(o.id,eligible);
  // Calendar reminders are independent of work-week and response-time policies.
  for(const r of orderReminders(o,[],today)){const node=r.page?o.details.business_process?.[r.page]:null;add(o,r.key+':'+(o.details.dates?.[r.key]?.date||r.due)+(r.page&&r.overdue?':overdue':''),r.title,r.title+'｜'+r.due+(node?.problem?'\n异常：'+node.problem+'\n预计解决：'+node.expected:''),[r.owner_id||o.logistics_id,...(r.overdue?leaders:[])],!r.key.startsWith('process-problem-')&&!r.key.startsWith('customer-sync-'));}
  for(const [page,node] of Object.entries(o.details.business_process||{}) as [string,any][])if(node.customer_followup?.money_related&&!node.customer_followup.commercial_notice)add(o,'customer-money-'+page+':'+(node.customer_pending_at||node.at),page+' · 金额事项先请商务确认','涉及金额、费用或付款，请商务确认处理口径，跟单记录确认依据。',[o.commercial_id]);
  for(const t of tasks.filter(t=>t.order_id===o.id)){
   const meta=JSON.parse(t.meta||'{}'),content=t.title+'\n当前：'+t.impact+'\n下一步：'+t.next_action+'\n期限：'+t.due_at;
   const overdue=!!t.due_at&&Date.parse(t.due_at)<Date.parse(at),follow=!!t.next_followup&&Date.parse(t.next_followup)<=Date.parse(at);
   if(overdue||follow||t.due_at&&Date.parse(t.due_at)===Date.parse(at))add(o,t.id+':'+(overdue?'overdue':'due')+':'+(overdue?t.due_at:t.next_followup),'任务'+(overdue?'逾期':'到期跟进')+'：'+t.title,content,[t.owner_id,...(overdue?leaders:[])],true);
   if(t.kind==='金额事项'&&meta.money?.state!=='已确认')add(o,t.id+':money:'+t.updated,'金额待确认：'+t.title,content,[o.commercial_id,...leaders]);
   if(t.kind==='异常'||['重大','紧急'].includes(meta.priority))add(o,t.id+':exception:'+t.updated,'异常待处理：'+t.title,content,[o.commercial_id,...leaders]);
   if(meta.priority==='紧急')add(o,t.id+':urgent:'+t.updated,'紧急事项：'+t.title,content,[active.has(o.details.delegate_id)?o.details.delegate_id:o.logistics_id]);
  }
 }
 // Store delivery in the CRM inbox; reading is acknowledged only by the recipient.
 const statements=[db.prepare("UPDATE crm_followup_notifications SET resolved_at=? WHERE resolved_at='' AND dedupe_key NOT LIKE 'confirmation:%'"+(orderId?' AND order_id=?':'')).bind(at,...(orderId?[orderId]:[])),...notices.map(n=>db.prepare("INSERT INTO crm_followup_notifications(id,dedupe_key,order_id,recipient_id,title,content,created) VALUES(?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO UPDATE SET resolved_at='',title=excluded.title,content=excluded.content").bind(id(),n.key,n.order_id,n.recipient,n.title,n.content,at))];
 if(!orderId)statements.push(db.prepare("INSERT INTO crm_followup_notification_run(id,finished,count) VALUES('main',?,?) ON CONFLICT(id) DO UPDATE SET finished=excluded.finished,count=excluded.count").bind(at,notices.length));
 await db.batch(statements);return {count:notices.length,finished:at};
}
export async function notificationEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 if(!path.startsWith('followup-notifications'))return undefined;
 if(path==='followup-notifications'&&method==='GET'){
  const rows=(await db.prepare('SELECT n.*,u.name AS recipient_name FROM crm_followup_notifications n JOIN crm_users u ON u.id=n.recipient_id WHERE n.recipient_id=?'+(user.role==='followup'?' AND EXISTS(SELECT 1 FROM crm_followup_orders o WHERE o.id=n.order_id AND o.logistics_id=n.recipient_id)':'')+' ORDER BY (n.resolved_at=\'\') DESC,n.created DESC LIMIT 200').bind(user.id).all()).results;
  const enquiries=(await db.prepare("SELECT n.*,n.dedupe_key LIKE 'handoff:%' AS important_change,u.name AS recipient_name,'站内' AS channel,'' AS resolved_at FROM crm_lead_notifications n JOIN crm_users u ON u.id=n.recipient_id JOIN crm_leads l ON l.id=n.lead_id WHERE COALESCE(l.grade,'') NOT IN ('Yifun Staff','同事') AND n.recipient_id=? AND l.owner_id=? ORDER BY n.created DESC LIMIT 200").bind(user.id,user.id).all<any>()).results.map(n=>user.role==='followup'?{...n,lead_id:null}:n);
  return {assignments:await assignmentReminders(db,user),notifications:[...rows,...enquiries].sort((a:any,b:any)=>Number(!b.read_at)-Number(!a.read_at)||b.created.localeCompare(a.created)).slice(0,200),run:user.role==='followup'?null:await db.prepare("SELECT finished,count FROM crm_followup_notification_run WHERE id='main'").first(),channel:'站内通知',email:'未启用'};
 }
 if(path==='followup-notifications/audit'&&method==='GET'){
  if(!can(user,'followup_all'))throw new AllocationError('只有管理者可以查看全公司通知状态',403);
  const rows=(await db.prepare('SELECT n.*,u.name AS recipient_name FROM crm_followup_notifications n JOIN crm_users u ON u.id=n.recipient_id ORDER BY n.created DESC LIMIT 200').all<any>()).results;
  const enquiries=can(user,'customers_all')?(await db.prepare("SELECT n.*,n.dedupe_key LIKE 'handoff:%' AS important_change,u.name AS recipient_name,'站内' AS channel,'' AS resolved_at FROM crm_lead_notifications n JOIN crm_users u ON u.id=n.recipient_id ORDER BY n.created DESC LIMIT 200").all<any>()).results:[];
  return {notifications:[...rows,...enquiries].sort((a,b)=>b.created.localeCompare(a.created)).slice(0,200),run:user.role==='followup'?null:await db.prepare("SELECT finished,count FROM crm_followup_notification_run WHERE id='main'").first()};
 }
 if(path==='followup-notifications/read'&&method==='POST'){
  if(user.id!==actor.id)throw new AllocationError('请切回本人视角标记已读',403);
  const result=await db.prepare("UPDATE crm_followup_notifications SET read_at=CASE WHEN read_at='' THEN ? ELSE read_at END WHERE id=? AND recipient_id=?").bind(now(),String(body.id||''),user.id).run();
  if(!result.meta.changes){const leadNotice=await db.prepare("UPDATE crm_lead_notifications SET read_at=CASE WHEN read_at='' THEN ? ELSE read_at END WHERE id=? AND recipient_id=? AND EXISTS(SELECT 1 FROM crm_leads l WHERE l.id=lead_id AND l.owner_id=?)").bind(now(),String(body.id||''),user.id,user.id).run();if(!leadNotice.meta.changes)throw new AllocationError('通知不存在',404);}return {ok:true};
 }
 if(path==='followup-notifications/read-all'&&method==='POST'){
  if(user.id!==actor.id)throw new AllocationError('请切回本人视角标记已读',403);
  const at=now(),statements=[db.prepare("UPDATE crm_followup_notifications SET read_at=? WHERE recipient_id=? AND read_at='' AND created<=?"+(user.role==='followup'?' AND EXISTS(SELECT 1 FROM crm_followup_orders o WHERE o.id=order_id AND o.logistics_id=recipient_id)':'')).bind(at,user.id,at)];
  statements.push(db.prepare("UPDATE crm_lead_notifications SET read_at=? WHERE recipient_id=? AND read_at='' AND created<=? AND EXISTS(SELECT 1 FROM crm_leads l WHERE l.id=lead_id AND l.owner_id=?)").bind(at,user.id,at,user.id));
  if(user.role!=='followup'){
   statements.push(db.prepare("UPDATE crm_sales_notifications SET read_at=? WHERE recipient_id=? AND read_at='' AND created<=? AND EXISTS(SELECT 1 FROM crm_leads l WHERE l.id=lead_id AND (l.owner_id=? OR EXISTS(SELECT 1 FROM crm_sales_tasks t WHERE t.id=task_id AND t.owner_id=?)"+(can(user,'customers_all')?' OR 1=1':'')+'))').bind(at,user.id,at,user.id,user.id));
  }
  const results=await db.batch(statements);return {ok:true,updated:results.reduce((count,result)=>count+Number(result.meta.changes||0),0),read_at:at};
 }
 throw new AllocationError('通知操作不存在',404);
}
