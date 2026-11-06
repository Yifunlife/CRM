import {allocationMarketSQL,validAssignmentSQL} from './allocation-events';
import {domesticProjectBudget} from './domestic-budget';
import {performanceRange} from './allocation-period';
import {customerLeadSQL} from './contact-kind';
import {allocationPerformance} from './allocation-performance-server';
import {adjustedShares} from './allocation-performance';
import {automaticAllocationRecipient,DOMESTIC_AUTO_EXCLUDED_USER} from './allocation-intake';
import {digest} from './crm';
import {ALLOCATION_START,allocationPoliciesSQL,fullLeadSQL,cumulativeAllocationCounts} from './allocation-priority';
import {canSetManagement} from './crm';
import {BUSINESS_SCOPES,GLOBAL_ALLOCATION_SCOPE,defaultConfig,monthNow,nextMonth,validMonth,validateConfig,effectiveShares,equalShares,type Config} from './allocation';
import {id,now,can} from './crm';
export class AllocationError extends Error {constructor(message:string,public status=400){super(message);}}
async function configFor(db:D1Database):Promise<Config>{const row:any=await db.prepare('SELECT payload FROM crm_allocation_configs WHERE scope=?').bind(GLOBAL_ALLOCATION_SCOPE).first();return row?JSON.parse(row.payload):defaultConfig();}
async function planFor(db:D1Database,scope:string,month:string){const row:any=await db.prepare('SELECT * FROM crm_allocation_plans WHERE scope=? AND month<=? ORDER BY month DESC LIMIT 1').bind(scope,month).first();return row?{...row,...JSON.parse(row.payload)}:null;}
async function activeUsers(db:D1Database){return (await db.prepare("SELECT id,name,role,active,trade_scopes FROM crm_users WHERE role IN ('sales','ceo','management') ORDER BY name").all<any>()).results;}
export async function allocationWeights(db:D1Database,_scope?:string){const report=await allocationPerformance(db),config=report.config,rows=report.rows.filter(p=>p.active&&p.member?.state==='参与'),adjusted=config.performance?.mode==='performance'||rows.some(p=>p.performance.manual);return {config,configVersion:report.configVersion,overrideVersion:report.overrideVersion,adjusted,people:rows,weights:adjustedShares(rows.map(p=>({user_id:p.id,retention:p.performance.retention})))};}
export async function distribute(db:D1Database,ids:string[],scope:string,actor:string,options:{reallocation?:boolean}={}){
 const {weights,people,adjusted,configVersion,overrideVersion}=await allocationWeights(db);if(!weights.length)throw new AllocationError('全渠道分配尚无正常接收人员');
 const month=monthNow(),created=now(),statements:D1PreparedStatement[]=[],filter=scope===GLOBAL_ALLOCATION_SCOPE?'':scope;
 const ordered=(await db.prepare(`SELECT id,market,country,detail,source,business_scope,${allocationMarketSQL('crm_leads')} AS allocation_market,${fullLeadSQL('crm_leads')} AS is_full FROM crm_leads WHERE ${customerLeadSQL('crm_leads')} AND id IN (SELECT value FROM json_each(?)) ORDER BY is_full DESC,entered,id`).bind(JSON.stringify(ids)).all<{id:string;allocation_market:string;is_full:number;business_scope:string;country:string;source:string;detail:string}>()).results;
 for(const lead of ordered){
  if(!['内贸','外贸'].includes(lead.allocation_market))continue;const {id:leadId,is_full}=lead,market=lead.allocation_market,budget=market==='内贸'?domesticProjectBudget(lead):null,priority=!!budget?.qualifies,eligible=people.filter(p=>automaticAllocationRecipient(p,market,lead)&&(!priority||p.id===DOMESTIC_AUTO_EXCLUDED_USER)),candidates=priority?eligible.map(p=>({user_id:p.id,share:100})):adjustedShares(eligible.map(p=>({user_id:p.id,retention:p.performance.retention})));if(!candidates.length)continue;const retained=candidates.reduce((n,p)=>n+p.share,0);if(retained<99.999&&parseInt((await digest(leadId+month)).slice(0,8),16)%10000>=retained*100)continue;
  // The choice and update run in the same database statement. Each next lead sees the preceding assignment in this batch.
  statements.push(db.prepare(`WITH candidates AS (SELECT json_extract(value,'$.user_id') AS user_id,CAST(json_extract(value,'$.share') AS REAL) AS share FROM json_each(?) w WHERE EXISTS(SELECT 1 FROM crm_users u WHERE u.id=json_extract(w.value,'$.user_id') AND u.active=1 AND u.role IN ('sales','ceo','management') AND (?<>'domestic' OR u.id<>? OR ?>=2000000) AND EXISTS(SELECT 1 FROM json_each(u.trade_scopes) WHERE value=?)) AND EXISTS(SELECT 1 FROM crm_allocation_configs cfg,json_each(cfg.payload,'$.members') m WHERE cfg.scope=? AND json_extract(m.value,'$.user_id')=json_extract(w.value,'$.user_id') AND json_extract(m.value,'$.state')='参与')), counts AS (SELECT c.*, (SELECT COUNT(DISTINCT a.lead_id) FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE a.owner_id=c.user_id AND a.created>=? AND a.policy IN ${allocationPoliciesSQL} AND l.review=0 AND ${customerLeadSQL()} AND ${validAssignmentSQL()} AND (${allocationMarketSQL()})=?) AS n,(SELECT COUNT(DISTINCT a.lead_id) FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE a.owner_id=c.user_id AND a.created>=? AND a.policy IN ${allocationPoliciesSQL} AND l.review=0 AND ${customerLeadSQL()} AND ${validAssignmentSQL()} AND (${allocationMarketSQL()})=? AND ${fullLeadSQL()}) AS full_count FROM candidates c), pick AS (SELECT user_id FROM counts ORDER BY CASE WHEN ? THEN full_count ELSE n END / CASE WHEN ? THEN share ELSE 1 END,n / CASE WHEN ? THEN share ELSE 1 END,user_id LIMIT 1) UPDATE crm_leads SET owner_id=(SELECT user_id FROM pick) WHERE id=? AND (?='' OR business_scope=?) AND business_scope IN (SELECT value FROM json_each(?)) AND cohort='new' AND owner_id IS NULL AND original_owner='' AND review=0 AND COALESCE(grade,'') NOT IN ('Yifun Staff','同事') AND (?=1 OR NOT EXISTS(SELECT 1 FROM crm_assignments WHERE lead_id=crm_leads.id)) AND EXISTS(SELECT 1 FROM pick) AND (market NOT IN ('内贸','外贸') OR market=?) AND (?<>'内贸' OR detail=?) AND (SELECT payload FROM crm_allocation_configs WHERE scope='all')=? AND (SELECT COALESCE(SUM(json_extract(payload,'$.version')),0) FROM crm_allocation_configs WHERE scope LIKE ?)=?`).bind(JSON.stringify(candidates),market==='内贸'?'domestic':'foreign',DOMESTIC_AUTO_EXCLUDED_USER,budget?.qualifies?budget.minimum:0,market==='内贸'?'domestic':'foreign',GLOBAL_ALLOCATION_SCOPE,ALLOCATION_START,market,ALLOCATION_START,market,is_full,adjusted?1:0,adjusted?1:0,leadId,filter,filter,JSON.stringify(BUSINESS_SCOPES.map(s=>s.id)),options.reallocation?1:0,market,market,lead.detail,configVersion,'performance:'+month+':%',overrideVersion));
  statements.push(db.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,business_scope,allocation_month,policy) SELECT ?,id,?,owner_id,?,business_scope,?,? FROM crm_leads WHERE id=? AND changes()>0 AND owner_id IS NOT NULL AND (?=1 OR NOT EXISTS(SELECT 1 FROM crm_assignments WHERE lead_id=?))").bind(id(),actor,created,month,options.reallocation?'domestic-reallocation-v1':'full-first-v1',leadId,options.reallocation?1:0,leadId));
 }
 const result=await db.batch(statements);return result.filter((_,i)=>i%2===0).reduce((n,r)=>n+(r.meta.changes||0),0);
}
async function report(db:D1Database,scope:string,month:string,period?:ReturnType<typeof performanceRange>){
 const config=await configFor(db),users=await activeUsers(db),plan=await planFor(db,scope,month),next=nextMonth(month),all=scope===GLOBAL_ALLOCATION_SCOPE,args=all?[]:[scope];
 const weights=effectiveShares(config,plan,users.filter(u=>u.active).map(u=>u.id));
 const deals=(await db.prepare('SELECT owner_id,COUNT(*) AS n FROM crm_deals WHERE '+(all?'1=1':'business_scope=?')+' AND cancelled=0 AND '+(period?'deal_date>=? AND deal_date<=?':'substr(deal_date,1,7)=?')+' GROUP BY owner_id').bind(...args,...(period?[period.from,period.to]:[month])).all<any>()).results;
 const assigned=(await db.prepare('SELECT owner_id,COUNT(*) AS n FROM crm_assignments WHERE '+(all?'1=1':'business_scope=?')+' AND '+(period?'created>=? AND created<?':'allocation_month=?')+' AND '+validAssignmentSQL('crm_assignments')+' AND policy NOT IN (\'historical-alignment\',\'historical-sync\') AND EXISTS(SELECT 1 FROM crm_leads l WHERE l.id=crm_assignments.lead_id AND l.cohort=\'new\') GROUP BY owner_id').bind(...args,...(period?[period.startAt,period.endAt]:[month])).all<any>()).results;
 const globalAssigned=(await db.prepare("SELECT owner_id,COUNT(*) AS n FROM crm_assignments WHERE allocation_month=? AND policy IN ('equal-v1','equal-global-v1','full-first-v1','domestic-reallocation-v1') AND "+validAssignmentSQL('crm_assignments')+" AND EXISTS(SELECT 1 FROM crm_leads l WHERE l.id=crm_assignments.lead_id AND l.cohort='new') GROUP BY owner_id").bind(monthNow()).all<any>()).results;
 const cash=(await db.prepare("SELECT d.owner_id,SUM(CASE WHEN r.currency='CNY' THEN r.amount_minor ELSE 0 END) cny,SUM(CASE WHEN r.currency='USD' THEN r.amount_minor ELSE 0 END) usd,COUNT(DISTINCT d.id) paid_orders FROM crm_receipts r JOIN crm_deals d ON d.id=r.deal_id WHERE "+(all?'1=1':'d.business_scope=?')+" AND d.cancelled=0 AND r.cancelled=0 AND "+(period?"r.received_date>=? AND r.received_date<=?":"substr(r.received_date,1,7)=?")+" GROUP BY d.owner_id").bind(...args,...(period?[period.from,period.to]:[month])).all<any>()).results;
 const receiptPolicy=config.rule.receipts!==false&&month>='2026-10';
 const conversion=(await db.prepare('SELECT l.owner_id,COUNT(DISTINCT l.id) AS assigned,COUNT(DISTINCT CASE WHEN d.id IS NOT NULL THEN l.id END) AS converted FROM crm_leads l LEFT JOIN crm_deals d ON d.lead_id=l.id AND d.cancelled=0 AND d.business_scope=l.business_scope AND d.owner_id=l.owner_id WHERE '+(all?'1=1':'l.business_scope=?')+' AND l.owner_id IS NOT NULL GROUP BY l.owner_id').bind(...args).all<any>()).results;
 const confirmed:any=period&&!period.month?null:await db.prepare('SELECT * FROM crm_allocation_plans WHERE key=?').bind(scope+':'+next).first();
 const liveCurrent=equalShares(config,users.filter(u=>u.active).map(u=>u.id));
 const proposal=liveCurrent,warning='';
 return {marketPriorityAssigned:{内贸:await cumulativeAllocationCounts(db,'内贸'),外贸:await cumulativeAllocationCounts(db,'外贸')},priorityAssigned:await cumulativeAllocationCounts(db),allocationStart:ALLOCATION_START,period,scope,config_scope:GLOBAL_ALLOCATION_SCOPE,month,next,config,users,cash,receiptPolicy,policy:'full-first-v1',liveCurrent,current:weights,plan_month:plan?.month||'',deals,assigned,globalAssigned,conversion,proposal,warning,confirmed:confirmed?{...confirmed,payload:JSON.parse(confirmed.payload)}:null,closed:month<monthNow(),timezone:'Australia/Sydney'};
}
export async function allocationEndpoint(db:D1Database,user:any,path:string,method:string,body:any,url:URL){
 if(!path.startsWith('allocation/'))return undefined;
 if(method==='GET'&&!can(user,'performance_view')&&user.role!=='admin')throw new AllocationError('此操作需要运营或管理员权限',403);
 if(method!=='GET'&&!canSetManagement(user))throw new AllocationError('只有 Winnie、CEO、徐泽贵可以设置分配管理',403);
 const scope=String(body.scope||url.searchParams.get('scope')||GLOBAL_ALLOCATION_SCOPE);
 if(scope!==GLOBAL_ALLOCATION_SCOPE&&!BUSINESS_SCOPES.some(s=>s.id===scope))throw new AllocationError('请选择有效业务范围');
 if(path==='allocation/report'&&method==='GET'){
  if(url.searchParams.has('from')||url.searchParams.has('to')){
   let period:ReturnType<typeof performanceRange>;try{period=performanceRange(url.searchParams.get('from')||'',url.searchParams.get('to')||'');}catch(e:any){throw new AllocationError(e.message);}
   const month=period.month||period.to.slice(0,7);return report(db,scope,month,period);
  }
  const month=url.searchParams.get('month')||monthNow();if(!validMonth(month)||month>monthNow())throw new AllocationError('请选择本月或过去月份');return report(db,scope,month);
 }
 if(path==='allocation/distribute'&&method==='POST'){
  const ids=[...new Set<string>(body.ids||[])];if(!ids.length||ids.length>200)throw new AllocationError('每次选择1至200条客资');
  const selected=(await db.prepare("SELECT id FROM crm_leads WHERE id IN (SELECT value FROM json_each(?)) AND (?=? OR business_scope=?) AND business_scope IN (SELECT value FROM json_each(?)) AND cohort='new' AND owner_id IS NULL AND original_owner='' AND review=0 AND COALESCE(grade,'') NOT IN ('Yifun Staff','同事')").bind(JSON.stringify(ids),scope,GLOBAL_ALLOCATION_SCOPE,scope,JSON.stringify(BUSINESS_SCOPES.map(s=>s.id))).all()).results;
  if(selected.length!==ids.length)throw new AllocationError('请选择业务范围已明确、没有负责人且无归属冲突的新增客资；限定范围时须属于同一业务范围');
  return {assigned:await distribute(db,ids,scope,user.id)};
 }
 if(!canSetManagement(user))throw new AllocationError('只有 Winnie、CEO、徐泽贵可以修改分配规则',403);
 if(path==='allocation/config'&&method==='POST'){
  if(scope!==GLOBAL_ALLOCATION_SCOPE)throw new AllocationError('已改为全渠道共同分配，请刷新页面后保存全渠道设置',409);
  const config:any={...body.config};const previous:any=await configFor(db);if(previous.performance)config.performance=previous.performance;else delete config.performance;try{validateConfig(config,await activeUsers(db));}catch(e:any){throw new AllocationError(e.message);}
  await db.prepare('INSERT INTO crm_allocation_configs(scope,payload,updated,updated_by) VALUES(?,?,?,?) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload,updated=excluded.updated,updated_by=excluded.updated_by').bind(scope,JSON.stringify(config),now(),user.id).run();return {ok:true};
 }
 if(path==='allocation/confirm'&&method==='POST')throw new AllocationError('新增客资按全案优先、累计均衡分配，不再确认业绩占比；历史方案保留查阅',409);
 throw new AllocationError('分配操作不存在',404);
}
