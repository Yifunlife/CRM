import {can,id,now} from './crm';
import {AllocationError} from './allocation-server';
import {orderReminders} from './order-followup';
import {chinaDay} from './followup-phase1';

export async function refreshFollowupNotifications(db:D1Database,at=now()){
 const users=(await db.prepare('SELECT id,role,permissions FROM crm_users WHERE active=1').all<any>()).results;
 const active=new Set(users.map(u=>u.id)),leaders=users.filter(u=>can(u,'followup_all')).map(u=>u.id);
 const orders=(await db.prepare('SELECT * FROM crm_followup_orders WHERE archived=0').all<any>()).results;
 const tasks=(await db.prepare("SELECT t.* FROM crm_followup_tasks t JOIN crm_followup_orders o ON o.id=t.order_id WHERE o.archived=0 AND t.status='待处理'").all<any>()).results;
 const today=chinaDay(at),notices:any[]=[];
 const add=(o:any,key:string,title:string,content:string,recipients:string[])=>{for(const recipient of new Set(recipients.filter(r=>active.has(r))))notices.push({key:o.id+':'+key+':'+recipient,order_id:o.id,recipient,title,content:o.project+'｜'+o.order_number+'\n'+content});};
 for(const raw of orders){
  const o={...raw,details:JSON.parse(raw.details),steps:JSON.parse(raw.steps)};
  // Calendar reminders are independent of work-week and response-time policies.
  for(const r of orderReminders(o,[],today))add(o,r.key+':'+(o.details.dates?.[r.key]?.date||r.due),r.title,r.title+'｜'+r.due,[o.logistics_id,...(r.overdue?leaders:[])]);
  for(const t of tasks.filter(t=>t.order_id===o.id)){
   const meta=JSON.parse(t.meta||'{}'),content=t.title+'\n当前：'+t.impact+'\n下一步：'+t.next_action+'\n期限：'+t.due_at;
   const overdue=!!t.due_at&&Date.parse(t.due_at)<Date.parse(at),follow=!!t.next_followup&&Date.parse(t.next_followup)<=Date.parse(at);
   if(overdue||follow||t.due_at&&Date.parse(t.due_at)===Date.parse(at))add(o,t.id+':'+(overdue?'overdue':'due')+':'+(overdue?t.due_at:t.next_followup),'任务'+(overdue?'逾期':'到期跟进')+'：'+t.title,content,[t.owner_id,...(overdue?leaders:[])]);
   if(t.kind==='金额事项'&&meta.money?.state!=='已确认')add(o,t.id+':money:'+t.updated,'金额待确认：'+t.title,content,[o.commercial_id,...leaders]);
   if(t.kind==='异常'||['重大','紧急'].includes(meta.priority))add(o,t.id+':exception:'+t.updated,'异常待处理：'+t.title,content,[o.commercial_id,...leaders]);
   if(meta.priority==='紧急')add(o,t.id+':urgent:'+t.updated,'紧急事项：'+t.title,content,[active.has(o.details.delegate_id)?o.details.delegate_id:o.logistics_id]);
  }
 }
 // Store delivery in the CRM inbox; reading is acknowledged only by the recipient.
 const statements=[db.prepare("UPDATE crm_followup_notifications SET resolved_at=? WHERE resolved_at=''").bind(at),...notices.map(n=>db.prepare("INSERT INTO crm_followup_notifications(id,dedupe_key,order_id,recipient_id,title,content,created) VALUES(?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO UPDATE SET resolved_at='',title=excluded.title,content=excluded.content").bind(id(),n.key,n.order_id,n.recipient,n.title,n.content,at)),db.prepare("INSERT INTO crm_followup_notification_run(id,finished,count) VALUES('main',?,?) ON CONFLICT(id) DO UPDATE SET finished=excluded.finished,count=excluded.count").bind(at,notices.length)];
 await db.batch(statements);return {count:notices.length,finished:at};
}
export async function notificationEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 if(!path.startsWith('followup-notifications'))return undefined;
 if(path==='followup-notifications'&&method==='GET'){
  await refreshFollowupNotifications(db);
  const rows=(await db.prepare('SELECT n.*,u.name AS recipient_name FROM crm_followup_notifications n JOIN crm_users u ON u.id=n.recipient_id WHERE n.recipient_id=? ORDER BY (n.resolved_at=\'\') DESC,n.created DESC LIMIT 200').bind(user.id).all()).results;
  return {notifications:rows,run:await db.prepare("SELECT finished,count FROM crm_followup_notification_run WHERE id='main'").first(),channel:'站内通知',email:'未启用'};
 }
 if(path==='followup-notifications/audit'&&method==='GET'){
  if(!can(user,'followup_all'))throw new AllocationError('只有管理者可以查看全公司通知状态',403);
  return {notifications:(await db.prepare('SELECT n.*,u.name AS recipient_name FROM crm_followup_notifications n JOIN crm_users u ON u.id=n.recipient_id ORDER BY n.created DESC LIMIT 200').all()).results,run:await db.prepare("SELECT finished,count FROM crm_followup_notification_run WHERE id='main'").first()};
 }
 if(path==='followup-notifications/read'&&method==='POST'){
  if(user.id!==actor.id)throw new AllocationError('请切回本人视角标记已读',403);
  const result=await db.prepare("UPDATE crm_followup_notifications SET read_at=CASE WHEN read_at='' THEN ? ELSE read_at END WHERE id=? AND recipient_id=?").bind(now(),String(body.id||''),user.id).run();
  if(!result.meta.changes)throw new AllocationError('通知不存在',404);return {ok:true};
 }
 throw new AllocationError('通知操作不存在',404);
}
