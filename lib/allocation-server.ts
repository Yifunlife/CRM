import {BUSINESS_SCOPES,defaultConfig,monthNow,nextMonth,validMonth,validateConfig,effectiveShares,equalShares,type Config} from './allocation';
import {id,now,can} from './crm';
export class AllocationError extends Error {constructor(message:string,public status=400){super(message);}}
async function configFor(db:D1Database,scope:string):Promise<Config>{const row:any=await db.prepare('SELECT payload FROM crm_allocation_configs WHERE scope=?').bind(scope).first();return row?JSON.parse(row.payload):defaultConfig();}
async function planFor(db:D1Database,scope:string,month:string){const row:any=await db.prepare('SELECT * FROM crm_allocation_plans WHERE scope=? AND month<=? ORDER BY month DESC LIMIT 1').bind(scope,month).first();return row?{...row,...JSON.parse(row.payload)}:null;}
async function activeUsers(db:D1Database){return (await db.prepare("SELECT id,name,role,active FROM crm_users WHERE role IN ('sales','ceo','management') ORDER BY name").all<any>()).results;}
export async function allocationWeights(db:D1Database,scope:string){const config=await configFor(db,scope),users=await activeUsers(db);return {config,weights:equalShares(config,users.filter(u=>u.active&&['sales','ceo','management'].includes(u.role)).map(u=>u.id))};}
export async function distribute(db:D1Database,ids:string[],scope:string,actor:string){
 const {weights}=await allocationWeights(db,scope);if(!weights.length)throw new AllocationError('此业务范围没有参与分配的有效业务员');
 const month=monthNow(),created=now(),statements:D1PreparedStatement[]=[];
 for(const leadId of ids){
  // The choice and update run in the same database statement. Each next lead sees the preceding assignment in this batch.
  statements.push(db.prepare(`WITH candidates AS (SELECT json_extract(value,'$.user_id') AS user_id,json_extract(value,'$.share') AS share FROM json_each(?) w WHERE EXISTS(SELECT 1 FROM crm_users u WHERE u.id=json_extract(w.value,'$.user_id') AND u.active=1 AND u.role IN ('sales','ceo','management')) AND EXISTS(SELECT 1 FROM crm_allocation_configs cfg,json_each(cfg.payload,'$.members') m WHERE cfg.scope=? AND json_extract(m.value,'$.user_id')=json_extract(w.value,'$.user_id') AND json_extract(m.value,'$.state')='参与')), counts AS (SELECT c.*, (SELECT COUNT(*) FROM crm_assignments a WHERE a.owner_id=c.user_id AND a.business_scope=? AND a.allocation_month=? AND a.policy='equal-v1') AS n FROM candidates c), pick AS (SELECT user_id FROM counts ORDER BY n,user_id LIMIT 1) UPDATE crm_leads SET owner_id=(SELECT user_id FROM pick) WHERE id=? AND business_scope=? AND owner_id IS NULL AND original_owner='' AND review=0 AND EXISTS(SELECT 1 FROM pick)`).bind(JSON.stringify(weights),scope,scope,month,leadId,scope));
  statements.push(db.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,business_scope,allocation_month,policy) SELECT ?,id,?,owner_id,?,?,?,'equal-v1' FROM crm_leads WHERE id=? AND owner_id IS NOT NULL AND business_scope=? AND NOT EXISTS(SELECT 1 FROM crm_assignments WHERE lead_id=?)").bind(id(),actor,created,scope,month,leadId,scope,leadId));
 }
 const result=await db.batch(statements);return result.filter((_,i)=>i%2===0).reduce((n,r)=>n+(r.meta.changes||0),0);
}
async function report(db:D1Database,scope:string,month:string){
 const config=await configFor(db,scope),users=await activeUsers(db),plan=await planFor(db,scope,month),next=nextMonth(month);
 const weights=effectiveShares(config,plan,users.filter(u=>u.active&&['sales','ceo','management'].includes(u.role)).map(u=>u.id));
 const deals=(await db.prepare('SELECT owner_id,COUNT(*) AS n FROM crm_deals WHERE business_scope=? AND cancelled=0 AND substr(deal_date,1,7)=? GROUP BY owner_id').bind(scope,month).all<any>()).results;
 const assigned=(await db.prepare('SELECT owner_id,COUNT(*) AS n FROM crm_assignments WHERE business_scope=? AND allocation_month=? GROUP BY owner_id').bind(scope,month).all<any>()).results;
 const cash=(await db.prepare("SELECT d.owner_id,SUM(CASE WHEN r.currency='CNY' THEN r.amount_minor ELSE 0 END) cny,SUM(CASE WHEN r.currency='USD' THEN r.amount_minor ELSE 0 END) usd,COUNT(DISTINCT d.id) paid_orders FROM crm_receipts r JOIN crm_deals d ON d.id=r.deal_id WHERE d.business_scope=? AND d.cancelled=0 AND r.cancelled=0 AND substr(r.received_date,1,7)=? GROUP BY d.owner_id").bind(scope,month).all<any>()).results;
 const receiptPolicy=config.rule.receipts!==false&&month>='2026-10';
 const conversion=(await db.prepare('SELECT l.owner_id,COUNT(DISTINCT l.id) AS assigned,COUNT(DISTINCT CASE WHEN d.id IS NOT NULL THEN l.id END) AS converted FROM crm_leads l LEFT JOIN crm_deals d ON d.lead_id=l.id AND d.cancelled=0 AND d.business_scope=l.business_scope AND d.owner_id=l.owner_id WHERE l.business_scope=? AND l.owner_id IS NOT NULL GROUP BY l.owner_id').bind(scope).all<any>()).results;
 const confirmed:any=await db.prepare('SELECT * FROM crm_allocation_plans WHERE key=?').bind(scope+':'+next).first();
 const liveCurrent=equalShares(config,users.filter(u=>u.active).map(u=>u.id));
 const proposal=liveCurrent,warning='';
 return {scope,month,next,config,users,cash,receiptPolicy,policy:'equal-v1',liveCurrent,current:weights,plan_month:plan?.month||'',deals,assigned,conversion,proposal,warning,confirmed:confirmed?{...confirmed,payload:JSON.parse(confirmed.payload)}:null,closed:month<monthNow(),timezone:'Australia/Sydney'};
}
export async function allocationEndpoint(db:D1Database,user:any,path:string,method:string,body:any,url:URL){
 if(!path.startsWith('allocation/'))return undefined;
 if(!can(user,path==='allocation/distribute'?'leads_allocate':'performance_view')&&user.role!=='admin')throw new AllocationError('此操作需要运营或管理员权限',403);
 const scope=String(body.scope||url.searchParams.get('scope')||BUSINESS_SCOPES[0].id);
 if(!BUSINESS_SCOPES.some(s=>s.id===scope))throw new AllocationError('请选择有效业务范围');
 if(path==='allocation/report'&&method==='GET'){const month=url.searchParams.get('month')||monthNow();if(!validMonth(month)||month>monthNow())throw new AllocationError('请选择本月或过去月份');return report(db,scope,month);}
 if(path==='allocation/distribute'&&method==='POST'){
  const ids=[...new Set<string>(body.ids||[])];if(!ids.length||ids.length>200)throw new AllocationError('每次选择1至200条客资');
  const selected=(await db.prepare("SELECT id FROM crm_leads WHERE id IN (SELECT value FROM json_each(?)) AND business_scope=? AND owner_id IS NULL AND original_owner='' AND review=0").bind(JSON.stringify(ids),scope).all()).results;
  if(selected.length!==ids.length)throw new AllocationError('请选择同一业务范围内、没有负责人且已核查的客资');
  return {assigned:await distribute(db,ids,scope,user.id)};
 }
 if(user.role!=='admin')throw new AllocationError('只有管理员可以修改分配规则与确认月度占比',403);
 if(path==='allocation/config'&&method==='POST'){
  const config:Config=body.config;try{validateConfig(config,await activeUsers(db));}catch(e:any){throw new AllocationError(e.message);}
  await db.prepare('INSERT INTO crm_allocation_configs(scope,payload,updated,updated_by) VALUES(?,?,?,?) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload,updated=excluded.updated,updated_by=excluded.updated_by').bind(scope,JSON.stringify(config),now(),user.id).run();return {ok:true};
 }
 if(path==='allocation/confirm'&&method==='POST')throw new AllocationError('新增客户已统一平均分配，不再确认业绩占比；历史方案保留查阅',409);
 throw new AllocationError('分配操作不存在',404);
}
