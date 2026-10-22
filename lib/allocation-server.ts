import {BUSINESS_SCOPES,defaultConfig,monthNow,nextMonth,validMonth,validateConfig,suggest,receiptShares,effectiveShares,type Config} from './allocation';
import {id,now} from './crm';
export class AllocationError extends Error {constructor(message:string,public status=400){super(message);}}
async function configFor(db:D1Database,scope:string):Promise<Config>{const row:any=await db.prepare('SELECT payload FROM crm_allocation_configs WHERE scope=?').bind(scope).first();return row?JSON.parse(row.payload):defaultConfig();}
async function planFor(db:D1Database,scope:string,month:string){const row:any=await db.prepare('SELECT * FROM crm_allocation_plans WHERE scope=? AND month<=? ORDER BY month DESC LIMIT 1').bind(scope,month).first();return row?{...row,...JSON.parse(row.payload)}:null;}
async function activeUsers(db:D1Database){return (await db.prepare("SELECT id,name,role,active FROM crm_users WHERE role='sales' ORDER BY name").all<any>()).results;}
export async function allocationWeights(db:D1Database,scope:string){const config=await configFor(db,scope),plan=await planFor(db,scope,monthNow()),users=await activeUsers(db);return {config,weights:effectiveShares(config,plan,users.filter(u=>u.active).map(u=>u.id))};}
export async function distribute(db:D1Database,ids:string[],scope:string,actor:string){
 const {weights}=await allocationWeights(db,scope);if(!weights.length)throw new AllocationError('此业务范围没有参与分配的有效业务员');
 const month=monthNow(),created=now(),statements:D1PreparedStatement[]=[];
 for(const leadId of ids){
  // The choice and update run in the same database statement. Each next lead sees the preceding assignment in this batch.
  statements.push(db.prepare(`WITH candidates AS (SELECT json_extract(value,'$.user_id') AS user_id,json_extract(value,'$.share') AS share FROM json_each(?)), counts AS (SELECT c.*, (SELECT COUNT(*) FROM crm_assignments a WHERE a.owner_id=c.user_id AND a.business_scope=? AND a.allocation_month=?) AS n FROM candidates c), pick AS (SELECT user_id FROM counts ORDER BY ((SELECT COALESCE(SUM(n),0) FROM counts)+1)*share/100-n DESC,user_id LIMIT 1) UPDATE crm_leads SET owner_id=(SELECT user_id FROM pick) WHERE id=? AND business_scope=? AND owner_id IS NULL AND original_owner='' AND review=0`).bind(JSON.stringify(weights),scope,month,leadId,scope));
  statements.push(db.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,business_scope,allocation_month) SELECT ?,id,?,owner_id,?,?,? FROM crm_leads WHERE id=? AND owner_id IS NOT NULL AND business_scope=? AND NOT EXISTS(SELECT 1 FROM crm_assignments WHERE lead_id=?)").bind(id(),actor,created,scope,month,leadId,scope,leadId));
 }
 const result=await db.batch(statements);return result.filter((_,i)=>i%2===0).reduce((n,r)=>n+(r.meta.changes||0),0);
}
async function report(db:D1Database,scope:string,month:string){
 const config=await configFor(db,scope),users=await activeUsers(db),plan=await planFor(db,scope,month),next=nextMonth(month);
 const weights=effectiveShares(config,plan,users.filter(u=>u.active).map(u=>u.id));
 const deals=(await db.prepare('SELECT owner_id,COUNT(*) AS n FROM crm_deals WHERE business_scope=? AND cancelled=0 AND substr(deal_date,1,7)=? GROUP BY owner_id').bind(scope,month).all<any>()).results;
 const assigned=(await db.prepare('SELECT owner_id,COUNT(*) AS n FROM crm_assignments WHERE business_scope=? AND allocation_month=? GROUP BY owner_id').bind(scope,month).all<any>()).results;
 const cash=(await db.prepare("SELECT d.owner_id,SUM(CASE WHEN r.currency='CNY' THEN r.amount_minor ELSE 0 END) cny,SUM(CASE WHEN r.currency='USD' THEN r.amount_minor ELSE 0 END) usd,COUNT(DISTINCT d.id) paid_orders FROM crm_receipts r JOIN crm_deals d ON d.id=r.deal_id WHERE d.business_scope=? AND d.cancelled=0 AND r.cancelled=0 AND substr(r.received_date,1,7)=? GROUP BY d.owner_id").bind(scope,month).all<any>()).results;
 const receiptPolicy=config.rule.receipts!==false&&month>='2026-10';
 const conversion=(await db.prepare('SELECT l.owner_id,COUNT(DISTINCT l.id) AS assigned,COUNT(DISTINCT CASE WHEN d.id IS NOT NULL THEN l.id END) AS converted FROM crm_leads l LEFT JOIN crm_deals d ON d.lead_id=l.id AND d.cancelled=0 AND d.business_scope=l.business_scope AND d.owner_id=l.owner_id WHERE l.business_scope=? AND l.owner_id IS NOT NULL GROUP BY l.owner_id').bind(scope).all<any>()).results;
 const confirmed:any=await db.prepare('SELECT * FROM crm_allocation_plans WHERE key=?').bind(scope+':'+next).first();
 const participants=config.members.filter(m=>m.state!=='参与'||users.some(u=>u.id===m.user_id&&u.active));
 const tiers:Record<string,number>={};for(const p of plan?.shares||[])tiers[p.user_id]=p.tier||0;
 let proposal:any[]=[],warning='';try{proposal=receiptPolicy?receiptShares(participants,tiers,Object.fromEntries(cash.map(r=>[r.owner_id,r])),Object.fromEntries(weights.map(w=>[w.user_id,w.share]))):suggest(participants,Object.fromEntries(weights.map(w=>[w.user_id,w.share])),Object.fromEntries(deals.map(d=>[d.owner_id,d.n])),config.rule);}catch(e:any){warning=e.message;}
 const livePlan=await planFor(db,scope,monthNow()),liveCurrent=effectiveShares(config,livePlan,users.filter(u=>u.active).map(u=>u.id));
 return {scope,month,next,config,users,cash,receiptPolicy,liveCurrent,current:weights,plan_month:plan?.month||'',deals,assigned,conversion,proposal,warning,confirmed:confirmed?{...confirmed,payload:JSON.parse(confirmed.payload)}:null,closed:month<monthNow(),timezone:'Australia/Sydney'};
}
export async function allocationEndpoint(db:D1Database,user:any,path:string,method:string,body:any,url:URL){
 if(!path.startsWith('allocation/'))return undefined;
 if(user.role==='sales')throw new AllocationError('此操作需要运营或管理员权限',403);
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
 if(path==='allocation/confirm'&&method==='POST'){
  const month=String(body.month);if(!validMonth(month)||nextMonth(month)!==monthNow()&&month!==monthNow())throw new AllocationError('只能确认上月或本月对应的下月方案');
  if(month>=monthNow())throw new AllocationError('本月尚未结束，可预览，下个月再确认正式占比');
  const r=await report(db,scope,month);if(r.confirmed)throw new AllocationError('该月方案已确认，不能重复覆盖');if(r.warning||!r.proposal.length)throw new AllocationError(r.warning||'请先设置参与人员');
  if(!Array.isArray(body.shares))throw new AllocationError('请填写下月占比');
  const expected=r.proposal.map(p=>p.user_id),seen=new Set<string>();let total=0;
  for(const row of body.shares){const p=r.proposal.find(p=>p.user_id===row.user_id);if(!p||seen.has(row.user_id)||!Number.isFinite(row.share)||row.share<(r.receiptPolicy?0:r.config.rule.minimum)||row.share>100||(r.receiptPolicy?Math.abs(row.share-p.share)>0.0001:Math.abs(row.share-p.current)>r.config.rule.maxChange+0.0001)||Math.abs(row.share*100-Math.round(row.share*100))>1e-6)throw new AllocationError(r.receiptPolicy?'占比须与当月收款规则计算结果一致，且人员不能重复':'占比须符合最低比例、每月调整上限，且人员不能重复');seen.add(row.user_id);total+=row.share;}
  if(seen.size!==expected.length||Math.abs(total-100)>0.001)throw new AllocationError('所有参与人员的下月占比必须合计100%');
  const payload={shares:body.shares.map((p:any)=>({user_id:p.user_id,share:p.share,...(r.receiptPolicy?{tier:r.proposal.find(v=>v.user_id===p.user_id)?.tier||0}:{})})),report:r,rule:r.config.rule};
  // Preserve leave/paused tiers in the frozen snapshot without allocating them leads.
  if(r.receiptPolicy){const prior=await planFor(db,scope,r.month);for(const m of r.config.members.filter(m=>!payload.shares.some((p:any)=>p.user_id===m.user_id)))payload.shares.push({user_id:m.user_id,share:0,inactive:true,tier:prior?.shares.find((p:any)=>p.user_id===m.user_id)?.tier||0});}
  await db.prepare('INSERT INTO crm_allocation_plans(key,scope,month,payload,confirmed,confirmed_by) VALUES(?,?,?,?,?,?)').bind(scope+':'+r.next,scope,r.next,JSON.stringify(payload),now(),user.id).run();return {ok:true,month:r.next};
 }
 throw new AllocationError('分配操作不存在',404);
}
