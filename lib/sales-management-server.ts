import {can,id,now} from './crm';
import {AllocationError} from './allocation-server';
import {suiteDay} from './sales-suite';
import {salesManagementReport} from './sales-management';
import {accountTradeScopes} from './account-classification';
import {customerMarket} from './operations-dashboard';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
const list=async(db:D1Database,sql:string,args:any[]=[])=> (await db.prepare(sql).bind(...args).all<any>()).results;
export async function salesManagementEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any,url:URL){
 if(!['sales-management/report','sales-management/targets'].includes(path))return undefined;
 if(!['admin','ceo','management'].includes(user.role)||!can(user,'customers_all'))fail('没有销售管理查看权限',403);
 const canEdit=['admin','management'].includes(user.role)&&['admin','management'].includes(actor.role)&&can(user,'performance_view');
 if(path==='sales-management/report'&&method==='GET'){
  const [people,leads,links,deals,receipts,targets]=await Promise.all([
   list(db,"SELECT id,name,role,active,trade_scopes FROM crm_users WHERE role='sales' OR (role IN ('management','ceo') AND trade_scopes<>'[]') OR EXISTS(SELECT 1 FROM crm_deals d WHERE d.owner_id=crm_users.id) OR EXISTS(SELECT 1 FROM crm_leads l WHERE l.owner_id=crm_users.id) ORDER BY name"),
   list(db,'SELECT id,name,owner_id,grade,created,entered,country,source,business_scope,detail FROM crm_leads'),
   list(db,'SELECT lead_id,subject_id FROM crm_customer_subject_links'),
   list(db,'SELECT d.*,c.currency,c.total_minor FROM crm_deals d LEFT JOIN crm_workflow_contracts c ON c.deal_id=d.id WHERE d.cancelled=0'),
   list(db,'SELECT r.*,COALESCE((SELECT SUM(f.amount_minor) FROM crm_workflow_refunds f WHERE f.receipt_id=r.id),0) AS refunded_minor FROM crm_receipts r WHERE r.cancelled=0'),
   list(db,'SELECT * FROM crm_sales_targets')
  ]);
  try{return {...salesManagementReport({people,leads,links,deals,receipts,targets},url.searchParams,suiteDay()),can_edit:canEdit};}catch(e){return fail((e as Error).message);}
 }
 if(path!=='sales-management/targets'||method!=='POST')fail('操作不存在',405);
 if(!canEdit)fail('只有具备业绩权限的管理员或管理层可设置目标',403);
 if(!Array.isArray(body?.items)||!body.items.length||body.items.length>17)fail('请选择要保存的销售目标');
 const person:any=await db.prepare("SELECT id,active,role,trade_scopes FROM crm_users WHERE id=?").bind(body.owner_id||'').first();
 if(!person?.active||!['sales','management','ceo'].includes(person.role))fail('请选择有效业务员');
 if(!['CNY','USD'].includes(body.currency))fail('目标币种只能为人民币或美元');
 const scopes=accountTradeScopes(person),allowed=new Set(scopes.map(s=>s==='domestic'?'CNY':'USD'));
 if(!scopes.length){for(const l of await list(db,'SELECT country,source,business_scope,detail FROM crm_leads WHERE owner_id=?',[person.id])){const market=JSON.parse(l.detail||'{}')._sales_company?'外贸':customerMarket(l);if(market!=='待确认')allowed.add(market==='内贸'?'CNY':'USD');}}
 if(!allowed.has(body.currency))fail('目标币种与业务员业务范围不符，请先核实账号业务范围');
 const keys=new Set<string>(),statements:D1PreparedStatement[]=[];
 for(const item of body.items){
  const {period,period_start:start,amount,version}=item;
  if(!['month','quarter','year'].includes(period)||typeof start!=='string'||!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(start)||Number(start.slice(0,4))<2000||Number(start.slice(0,4))>9998||period==='quarter'&&![1,4,7,10].includes(Number(start.slice(5,7)))||period==='year'&&start.slice(5)!=='01-01')fail('目标周期无效');
  if(typeof amount!=='string'||!/^\d{1,10}(\.\d{1,2})?$/.test(amount)||!Number.isInteger(version)||version<0)fail('目标金额需为非负数，最多两位小数');
  const key=period+start;if(keys.has(key))fail('不能重复保存同一周期目标');keys.add(key);
  const minor=Math.round(Number(amount)*100),at=now();
  const current:any=await db.prepare('SELECT version FROM crm_sales_targets WHERE owner_id=? AND currency=? AND period=? AND period_start=?').bind(person.id,body.currency,period,start).first();
  if((current?.version||0)!==version)fail('目标已被其他人修改，请刷新后重新设置',409);
  if(version===0)statements.push(db.prepare('INSERT INTO crm_sales_targets(owner_id,currency,period,period_start,amount_minor,version,updated,updated_by) VALUES(?,?,?,?,?,1,?,?)').bind(person.id,body.currency,period,start,minor,at,actor.id));
  else statements.push(db.prepare('UPDATE crm_sales_targets SET amount_minor=?,version=CASE WHEN version=? THEN version+1 ELSE NULL END,updated=?,updated_by=? WHERE owner_id=? AND currency=? AND period=? AND period_start=?').bind(minor,version,at,actor.id,person.id,body.currency,period,start));
  statements.push(db.prepare('INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(id(),'设置销售目标',person.id,JSON.stringify({currency:body.currency,period,period_start:start,amount_minor:minor,previous_version:version}),at,actor.id));
 }
 try{await db.batch(statements);}catch(e){if(/UNIQUE|NOT NULL/.test(String(e)))fail('目标已被其他人修改，请刷新后重新设置',409);throw e;}
 return {ok:true};
}
