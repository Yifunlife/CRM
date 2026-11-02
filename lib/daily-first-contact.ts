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
  db.prepare(`SELECT l.id,l.name,l.owner_id,l.country,l.source,l.business_scope,l.detail,a.created assigned_at,
   (SELECT MIN(MAX(n.created,COALESCE(e.created,t.created,n.created))) FROM crm_notes n
    LEFT JOIN crm_sales_events e ON e.id=n.id AND e.kind='业务员跟进记录'
    LEFT JOIN crm_attribution_events t ON t.id=n.id AND t.kind='销售流程记录'
    WHERE n.lead_id=l.id AND n.user_id=l.owner_id AND n.created>=a.created AND n.created<=? AND COALESCE(e.created,t.created,n.created)<=?
    AND trim(n.content)<>'' AND n.method IN ('WhatsApp','邮件','电话','线上会议','到访公司','其他','首次WhatsApp','首次邮件')) completed_at
   FROM crm_leads l JOIN crm_assignments a ON a.id=(SELECT recent.id FROM crm_assignments recent WHERE recent.lead_id=l.id AND recent.owner_id=l.owner_id ORDER BY recent.created DESC,recent.rowid DESC LIMIT 1)
   WHERE l.review=0 AND a.policy IN ${allocationPoliciesSQL} AND a.created<=?`).bind(at,at,at).all<any>(),
  db.prepare("SELECT payload FROM crm_allocation_configs WHERE scope='all'").first<{payload:string}>()
 ]);
 const members:Record<string,string>=Object.fromEntries((settings?JSON.parse(settings.payload).members:[]).map((m:any)=>[m.user_id,m.state]));
 const rows=assigned.results.filter(l=>{
  const company=salesCompanyName(accountSalesCompany({id:l.owner_id})||JSON.parse(l.detail)._sales_company);
  const classified=company?'外贸':customerMarket(l);
  return (market==='全部'?(allowed.includes(classified)||canViewAllMarkets(user)):classified===market)&&(!branch||company===branch)&&salesDay(l.assigned_at)<=date;
 }).map(l=>({id:l.id,name:l.name,owner_id:l.owner_id,assigned_at:l.assigned_at,assigned_date:salesDay(l.assigned_at),completed_at:l.completed_at||'',overdue_days:l.completed_at?0:Math.max(0,Math.round((Date.parse(today)-Date.parse(salesDay(l.assigned_at)))/86400000)),late_completion:!!l.completed_at&&salesDay(l.completed_at)>salesDay(l.assigned_at)}));
 const people=users.results.filter(u=>{
  if(rows.some(l=>l.owner_id===u.id))return true;
  if(!u.active||!isSalesPerson(u)&&!members[u.id]||market!=='全部'&&!boardMarkets(u).includes(market))return false;
  return !branch||accountSalesCompany(u)===branch;
 }).map(u=>{
  const own=rows.filter(l=>l.owner_id===u.id),yesterday=own.filter(l=>l.assigned_date===date),pending=own.filter(l=>!l.completed_at).sort((a,b)=>b.overdue_days-a.overdue_days||a.name.localeCompare(b.name));
  const completed=yesterday.filter(l=>l.completed_at).length,late=yesterday.filter(l=>l.late_completion).length;
  return {id:u.id,name:u.name,active:u.active,allocation_state:members[u.id]||'',assigned:yesterday.length,completed,late_completed:late,incomplete:yesterday.length-completed,older_overdue:pending.filter(l=>l.assigned_date<date).length,max_overdue_days:pending[0]?.overdue_days||0,status:!yesterday.length?'昨日无新增分配':completed===yesterday.length?(late?'已补完成昨日首联':'已完成昨日首联'):completed?'昨日首联未全部完成':'尚未完成昨日首联',pending};
 });
 return {at,today,date,timezone:'Asia/Shanghai',market,branch,people,totals:{assigned:people.reduce((n,p)=>n+p.assigned,0),completed:people.reduce((n,p)=>n+p.completed,0),incomplete:people.reduce((n,p)=>n+p.incomplete,0),older_overdue:people.reduce((n,p)=>n+p.older_overdue,0)}};
}
