import {validAssignmentSQL} from './allocation-events';
import {customerLeadSQL} from './contact-kind';
import {boardMarkets,can,canViewAllMarkets,now} from './crm';
import {isSalesPerson,accountSalesCompany,salesCompanyName,SALES_COMPANIES} from './account-classification';
import {allocationPoliciesSQL} from './allocation-priority';
import {AllocationError} from './allocation-server';
import {customerMarket} from './operations-dashboard';
import {salesDay} from './sales-pipeline';

export async function dailyFirstContact(db:D1Database,user:any,url:URL,at=now()){
 if(!['admin','ceo','management'].includes(user.role)||!can(user,'customers_all'))throw new AllocationError('只有管理层可以查看团队首联完成情况',403);
 const allowed=boardMarkets(user),market=url.searchParams.get('market')||allowed[0],branch=salesCompanyName(url.searchParams.get('branch'));
 if(!allowed.includes(market)&&!(market==='全部'&&allowed.length===2))throw new AllocationError('没有此业务范围的看板查看权限',403);
 if(!['',...SALES_COMPANIES].includes(branch as any)||branch&&market!=='外贸')throw new AllocationError('分公司选择无效');
 const today=salesDay(at),date=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const [users,assigned,settings]=await Promise.all([
  db.prepare("SELECT id,name,role,trade_scopes,active FROM crm_users WHERE role IN ('sales','ceo','management') ORDER BY name").all<any>(),
  db.prepare(`SELECT l.id,l.name,l.owner_id,l.market,l.country,l.source,l.business_scope,l.detail,a.created assigned_at,
   (SELECT json_object('at',MAX(n.created,COALESCE(e.created,t.created,n.created)),'method',n.method,'message_sent',n.id LIKE 'online-%' AND n.content LIKE '线上发送已确认｜%') FROM crm_notes n
    LEFT JOIN crm_sales_events e ON e.id=n.id AND e.kind='业务员跟进记录'
    LEFT JOIN crm_attribution_events t ON t.id=n.id AND t.kind='销售流程记录'
    WHERE n.lead_id=l.id AND n.user_id=l.owner_id AND n.created>=a.created AND n.created<=? AND COALESCE(e.created,t.created,n.created)<=?
    AND trim(n.content)<>'' AND n.method IN ('WhatsApp','邮件','电话','线上会议','到访公司','其他','首次WhatsApp','首次邮件')
    ORDER BY MAX(n.created,COALESCE(e.created,t.created,n.created)),n.rowid LIMIT 1) completed_contact
   FROM crm_leads l JOIN crm_assignments a ON a.id=(SELECT recent.id FROM crm_assignments recent WHERE recent.lead_id=l.id AND recent.owner_id=l.owner_id AND ${validAssignmentSQL('recent')} ORDER BY recent.created DESC,recent.rowid DESC LIMIT 1)
   WHERE l.review=0 AND ${customerLeadSQL()} AND a.policy IN ${allocationPoliciesSQL} AND a.created<=?`).bind(at,at,at).all<any>(),
  db.prepare("SELECT payload FROM crm_allocation_configs WHERE scope='all'").first<{payload:string}>()
 ]);
 const members:Record<string,string>=Object.fromEntries((settings?JSON.parse(settings.payload).members:[]).map((m:any)=>[m.user_id,m.state]));
 const rows=assigned.results.filter(l=>{
  const company=salesCompanyName(accountSalesCompany({id:l.owner_id})||JSON.parse(l.detail)._sales_company);
  const classified=company?'外贸':customerMarket(l);
  return (market==='全部'?(allowed.includes(classified)||canViewAllMarkets(user)):classified===market)&&(!branch||company===branch)&&salesDay(l.assigned_at)<=today;
 }).map(l=>{
  const contact=JSON.parse(l.completed_contact||'null');
  return {id:l.id,name:l.name,owner_id:l.owner_id,assigned_at:l.assigned_at,assigned_date:salesDay(l.assigned_at),completed_at:contact?.at||'',contact_method:contact?.method||'',message_sent:!!contact?.message_sent,overdue_days:contact?0:Math.max(0,Math.round((Date.parse(today)-Date.parse(salesDay(l.assigned_at)))/86400000)),late_completion:!!contact&&salesDay(contact.at)>salesDay(l.assigned_at)};
 });
 const people=users.results.filter(u=>{
  if(rows.some(l=>l.owner_id===u.id))return true;
  if(!u.active||!isSalesPerson(u)&&!members[u.id]||market!=='全部'&&!boardMarkets(u).includes(market))return false;
  return !branch||accountSalesCompany(u)===branch;
 }).map(u=>{
  const own=rows.filter(l=>l.owner_id===u.id),todayLeads=own.filter(l=>l.assigned_date===today),yesterday=own.filter(l=>l.assigned_date===date),pending=own.filter(l=>!l.completed_at).sort((a,b)=>b.overdue_days-a.overdue_days||a.name.localeCompare(b.name));
  const completedLeads=own.filter(l=>l.assigned_date>=date&&l.completed_at),overdueLeads=pending.filter(l=>l.overdue_days>0),todayIncomplete=todayLeads.filter(l=>!l.completed_at).length;
  const completed=yesterday.filter(l=>l.completed_at).length,late=yesterday.filter(l=>l.late_completion).length;
  return {id:u.id,name:u.name,active:u.active,allocation_state:members[u.id]||'',today_assigned:todayLeads.length,today_incomplete:todayIncomplete,recent_completed:completedLeads.length,overdue:overdueLeads.length,today_leads:todayLeads,yesterday_leads:yesterday,completed_leads:completedLeads,overdue_leads:overdueLeads,assigned:yesterday.length,completed,late_completed:late,incomplete:yesterday.length-completed,older_overdue:pending.filter(l=>l.assigned_date<date).length,max_overdue_days:pending[0]?.overdue_days||0,status:todayIncomplete?'今日待联系 '+todayIncomplete+' 位':todayLeads.length?'今日首联已完成':!yesterday.length?'昨日无新增分配':completed===yesterday.length?(late?'已补完成昨日首联':'已完成昨日首联'):completed?'昨日首联未全部完成':'尚未完成昨日首联',pending};
 });
 return {at,today,date,timezone:'Asia/Shanghai',market,branch,people,totals:{today_assigned:people.reduce((n,p)=>n+p.today_assigned,0),today_incomplete:people.reduce((n,p)=>n+p.today_incomplete,0),recent_completed:people.reduce((n,p)=>n+p.recent_completed,0),overdue:people.reduce((n,p)=>n+p.overdue,0),assigned:people.reduce((n,p)=>n+p.assigned,0),completed:people.reduce((n,p)=>n+p.completed,0),incomplete:people.reduce((n,p)=>n+p.incomplete,0),older_overdue:people.reduce((n,p)=>n+p.older_overdue,0)}};
}
