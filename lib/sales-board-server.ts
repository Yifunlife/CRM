import {AllocationError} from './allocation-server';
import {roleWorkspaceEndpoint} from './role-workspace-server';
import {salesManagementEndpoint} from './sales-management-server';
import {dailyFirstContact} from './daily-first-contact';
import {accountSalesCompany,salesCompanyName,SALES_COMPANIES} from './account-classification';
import {customerMarket} from './operations-dashboard';
import {suiteDay} from './sales-suite';
import {boardFollowups} from './sales-board';
const pick=(row:any,keys:string[])=>Object.fromEntries(keys.map(key=>[key,row[key]]));
function boardReport(report:any){
 const customer=(row:any)=>pick(row,['id','name','owner_id','grade','created','company','market']);
 const project=(row:any)=>({...pick(row,['project_id','lead_id','owner_id','name','customer_name','stage','stage_at','expected_date','currency','amount_minor','created','company','market','customer_project_id']),details:{deal_id:row.details?.deal_id}});
 return {...pick(report,['market','period','at','summary','geography']),people:report.people.map((p:any)=>pick(p,['id','name','active','company'])),all_customers:report.all_customers.map(customer),customers:report.customers.map(customer),projects:report.projects.map(project),quoting_projects:report.quoting_projects.map(project),forecast:report.forecast.map(project),orders:report.orders.map((o:any)=>({...pick(o,['id','lead_id','sales_project_id','deal_id','project','customer_name','commercial_id','company','market','delivery_stage']),details:{}})),deals:report.deals.map((d:any)=>pick(d,['id','lead_id','owner_id','order_number','customer_name','deal_date','currency','total_minor','company','market'])),quotes:report.quotes.map((q:any)=>({...pick(q,['id','project_id','owner_id','lead_id']),summary:pick(q.summary,['available','contract_no','current_id','currency','amount_minor'])}))};
}
export async function salesBoardEndpoint(db:D1Database,user:any,path:string,method:string,url:URL,source?:D1Database){
 if(!['sales-board/report','sales-board/first-contact'].includes(path))return undefined;
 if(!user?.id||user.active===0)throw new AllocationError('请登录有效员工账号',403);
 if(method!=='GET')throw new AllocationError('销售看板仅支持读取',405);
 // This identity is used only for the approved, read-only dashboard projection.
 // Customer archives, project mutations and all other endpoints retain the caller's permissions.
 const viewer={id:user.id,role:'admin',active:1};
 if(path==='sales-board/first-contact'){
  const report=await dailyFirstContact(db,viewer,url);
  return {...pick(report,['at','today','date','timezone','market','branch','totals']),people:report.people.map(p=>pick(p,['id','name','active','allocation_state','today_assigned','today_incomplete','assigned','completed','late_completed','incomplete','overdue','max_overdue_days']))};
 }
 const query=new URL(url);query.searchParams.delete('personal');query.searchParams.delete('branch');query.searchParams.set('active','1');
 const month=query.searchParams.get('month')||suiteDay().slice(0,7),monthUrl=new URL(query);monthUrl.searchParams.set('period','month');monthUrl.searchParams.set('month',month);
 const read=(market:string)=>{const scoped=new URL(query);scoped.searchParams.set('market',market);return roleWorkspaceEndpoint(db,viewer,viewer,'role-workspace/report','GET',{},scoped,source);};
 const list=async(sql:string)=>(await db.prepare(sql).all<any>()).results;
 const [all,domestic,foreign,performance,monthly,orders,people,tasks,deals]=await Promise.all([
  read('全部'),read('内贸'),read('外贸'),
  salesManagementEndpoint(db,viewer,viewer,'sales-management/report','GET',{},query),
  salesManagementEndpoint(db,viewer,viewer,'sales-management/report','GET',{},monthUrl),
  list('SELECT o.*,s.name AS logistics_name,c.name AS commercial_name FROM crm_followup_orders o JOIN crm_users s ON s.id=o.logistics_id JOIN crm_users c ON c.id=o.commercial_id WHERE s.active=1'),
  list("SELECT id,name,role,active FROM crm_users WHERE active=1 AND (role='followup' OR EXISTS(SELECT 1 FROM crm_followup_orders o WHERE o.logistics_id=crm_users.id AND o.archived=0)) ORDER BY name"),
  list("SELECT order_id,step,owner_id,kind,meta,due_at,next_action,status FROM crm_followup_tasks WHERE status='待处理'"),
  list("SELECT d.id,d.owner_id,d.deal_date,l.market,l.country,l.source,l.business_scope,l.detail,c.currency,c.total_minor FROM crm_deals d JOIN crm_users u ON u.id=d.owner_id AND u.active=1 JOIN crm_leads l ON l.id=d.lead_id LEFT JOIN crm_workflow_contracts c ON c.deal_id=d.id WHERE d.cancelled=0")
 ]);
 const period=(all as any).period,year=period.start.slice(0,4),annual={start:year+'-01-01',end:(Number(year)+1)+'-01-01'};
 const companies=['总公司',...SALES_COMPANIES].map(name=>({name,total:{} as Record<string,number>,period:{} as Record<string,number>,unverified:0,deals:0}));
 const trades=['内贸','外贸'].map((name,index)=>({name,currency:index?'USD':'CNY',total:0,unverified:0,monthly:0}));
 for(const deal of deals){
  const company=salesCompanyName(accountSalesCompany({id:deal.owner_id})||JSON.parse(deal.detail||'{}')._sales_company)||'总公司';
  const market=company!=='总公司'?'外贸':customerMarket(deal),trade=trades.find(t=>t.name===market),item=companies.find(c=>c.name===company)!;
  const inPeriod=deal.deal_date>=period.start&&deal.deal_date<period.end,inYear=deal.deal_date>=annual.start&&deal.deal_date<annual.end;
  if(inPeriod)item.deals++;
  if(!trade||deal.total_minor==null||deal.currency!==trade.currency){item.unverified++;if(inYear&&trade)trade.unverified++;continue;}
  item.total[deal.currency]=(item.total[deal.currency]||0)+deal.total_minor;
  if(inPeriod)item.period[deal.currency]=(item.period[deal.currency]||0)+deal.total_minor;
  if(inYear)trade.total+=deal.total_minor;
  if(deal.deal_date>=month+'-01'&&deal.deal_date<(monthly as any).period.end)trade.monthly+=deal.total_minor;
 }
 const safePerformance=(report:any)=>({period:report.period,rows:report.rows.filter((r:any)=>r.active).map((r:any)=>pick(r,['id','name','active','currency','new_customers','annual_customers','effective_customers','deals','total_minor','unverified','target_minor','annual_target_minor','annual_total_minor','annual_unverified','annual_completion','completion']))});
 return {all:boardReport(all),domestic:boardReport(domestic),foreign:boardReport(foreign),performance:safePerformance(performance),monthly:safePerformance(monthly),followups:boardFollowups(orders.map(o=>({...o,details:JSON.parse(o.details||'{}'),steps:JSON.parse(o.steps||'{}')})),people,tasks,suiteDay()),companies,trades};
}
