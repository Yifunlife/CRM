import {can,canSetManagement,id,now} from './crm';
import {monthNow,nextMonth,validMonth,defaultConfig} from './allocation';
import {customerAllocationSummary} from './customer-allocation-summary';
import {cumulativeAllocationCounts} from './allocation-priority';
import {performanceTier,type Adjustment} from './allocation-performance';
import {Problem} from './api/http';
const list=async(db:D1Database,sql:string,args:any[]=[])=> (await db.prepare(sql).bind(...args).all<any>()).results;
export async function allocationPerformance(db:D1Database,month=monthNow()){
 const [settings,people,cash,overrides]=await Promise.all([
  db.prepare("SELECT payload FROM crm_allocation_configs WHERE scope='all'").first<any>(),
  list(db,"SELECT id,name,role,active,trade_scopes FROM crm_users WHERE role IN ('sales','management','ceo') OR (role='followup' AND EXISTS(SELECT 1 FROM json_each(trade_scopes) WHERE value='domestic')) ORDER BY name,id"),
  list(db,"SELECT d.owner_id,substr(r.received_date,1,7) month,SUM(CASE WHEN r.currency='CNY' THEN r.amount_minor ELSE 0 END) cny,SUM(CASE WHEN r.currency='USD' THEN r.amount_minor ELSE 0 END) usd,COUNT(*) records FROM crm_receipts r JOIN crm_deals d ON d.id=r.deal_id WHERE d.cancelled=0 AND r.cancelled=0 AND r.received_date<? GROUP BY d.owner_id,substr(r.received_date,1,7)",[month+'-01']),
  list(db,"SELECT scope,payload FROM crm_allocation_configs WHERE scope LIKE 'performance:%'")
 ]);
 const config=settings?JSON.parse(settings.payload):defaultConfig(),start=config.performance?.mode==='performance'?config.performance.started:undefined;
 const rows=people.map(p=>{const values:Record<string,Adjustment>={};for(const o of overrides){const [,m,person]=o.scope.split(':');if(person===p.id)values[m]=JSON.parse(o.payload);}const receiptMonth=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-2,1)).toISOString().slice(0,7),receipt=cash.find(r=>r.owner_id===p.id&&r.month===receiptMonth);return {...p,member:config.members.find((m:any)=>m.user_id===p.id),cash:cash.filter(r=>r.owner_id===p.id),receipt:receipt||{cny:0,usd:0,records:0},adjustment:values[month]||null,performance:performanceTier(start,month,cash.filter(r=>r.owner_id===p.id),values)};});
 return {config,configVersion:settings?.payload||'',overrideVersion:overrides.filter(o=>o.scope.startsWith('performance:'+month+':')).reduce((n,o)=>n+(JSON.parse(o.payload).version||0),0),rows,month};
}
export async function allocationPerformanceEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any,url:URL){
 if(!['allocation/management/staff','allocation/management/adjustment','allocation/management/policy','allocation/management/state'].includes(path))return undefined;
 if(!can(user,'customers_all')||!can(user,'performance_view'))throw new Problem('没有分配管理查看权限',403);
 if(path==='allocation/management/staff'&&method==='GET'){
  const receiptMonth=url.searchParams.get('month')||new Date(Date.UTC(Number(monthNow().slice(0,4)),Number(monthNow().slice(5,7))-2,1)).toISOString().slice(0,7);
  if(!validMonth(receiptMonth)||receiptMonth>monthNow())throw new Problem('请选择本月或过去月份');
  const [report,summary,priority]=await Promise.all([allocationPerformance(db,nextMonth(receiptMonth)),customerAllocationSummary(db,user),cumulativeAllocationCounts(db)]);
  const rows=report.rows.filter(p=>p.active||p.member||summary.rows.some(r=>r.id===p.id)).map(p=>{const counts=summary.rows.find(r=>r.id===p.id);return {...p,name:p.name.replace(/^Winnie Wu$/,'Winnie'),state:p.active?p.member?.state||'未加入分配名单':'停用',today:counts?.today||0,month:counts?.month||0,full:priority.find(r=>r.owner_id===p.id)?.full_count||0};});
  rows.sort((a:any,b:any)=>{const ai=report.config.members.findIndex((m:any)=>m.user_id===a.id),bi=report.config.members.findIndex((m:any)=>m.user_id===b.id);return (ai<0?100000:ai)-(bi<0?100000:bi)||a.name.localeCompare(b.name,'zh-CN');});
  return {rows,receiptMonth,allocationMonth:report.month,date:summary.date,config:report.config,configVersion:report.configVersion,can_edit:canSetManagement(user)&&canSetManagement(actor)&&user.id===actor.id};
 }
 if(method!=='POST'||!canSetManagement(user)||!canSetManagement(actor)||user.id!==actor.id)throw new Problem('只有分配管理负责人可以修改',403);
 if(path==='allocation/management/state'){
  if(!['参与','请假','暂停'].includes(body.state))throw new Problem('请选择参与、请假或暂停');
  const old=await db.prepare("SELECT payload FROM crm_allocation_configs WHERE scope='all'").first<any>();if(!old)throw new Problem('请先设置接收名单');
  if(body.version!==old.payload)throw new Problem('接收名单已更新，请刷新后重试',409);
  const config=JSON.parse(old.payload);let member=config.members.find((m:any)=>m.user_id===body.user_id);
  const person=await db.prepare("SELECT id,trade_scopes FROM crm_users WHERE id=? AND active=1 AND (role IN ('sales','management','ceo') OR (role='followup' AND EXISTS(SELECT 1 FROM json_each(trade_scopes) WHERE value='domestic')))").bind(body.user_id).first<any>();
  if(!person)throw new Problem('只能设置已启用业务人员的接收状态');
  if(!member&&(body.state!=='参与'||!JSON.parse(person.trade_scopes).some((s:string)=>['domestic','foreign'].includes(s))))throw new Problem('加入接收名单前，请先设置内贸或外贸范围');
  if(member?.state===body.state)return {ok:true};
  const before=member?.state||'未加入分配名单';if(!member){member={user_id:body.user_id,state:body.state,share:0};config.members.push(member);}else member.state=body.state;
  const result=await db.batch([db.prepare("UPDATE crm_allocation_configs SET payload=?,updated=?,updated_by=? WHERE scope='all' AND payload=? AND EXISTS(SELECT 1 FROM crm_users WHERE id=? AND active=1 AND (role IN ('sales','management','ceo') OR (role='followup' AND EXISTS(SELECT 1 FROM json_each(trade_scopes) WHERE value='domestic'))) AND (?=0 OR EXISTS(SELECT 1 FROM json_each(trade_scopes) WHERE value IN ('domestic','foreign'))))").bind(JSON.stringify(config),now(),actor.id,old.payload,body.user_id,before==='未加入分配名单'?1:0),db.prepare("INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) SELECT ?,'修改接收状态',?,?,?,? WHERE changes()>0").bind(id(),body.user_id,JSON.stringify({before,after:body.state,operation:before+' → '+body.state}),now(),actor.id)]);
  if(!result[0].meta.changes)throw new Problem('接收名单或账号状态已更新，请刷新后重试',409);return {ok:true};
 }
 if(path==='allocation/management/policy'){
  if(!['original','performance'].includes(body.mode))throw new Problem('请选择有效分配规则');
  const old=await db.prepare("SELECT payload FROM crm_allocation_configs WHERE scope='all'").first<any>();if(!old)throw new Problem('请先设置接收名单');
  const config=JSON.parse(old.payload);if(body.version!==old.payload)throw new Problem('分配规则已更新，请刷新',409);
  config.performance={...config.performance,mode:body.mode,...(body.mode==='performance'&&config.performance?.mode!=='performance'?{started:monthNow()}:{}),reduced:'redistribute'};
  const result=await db.batch([db.prepare("UPDATE crm_allocation_configs SET payload=?,updated=?,updated_by=? WHERE scope='all' AND payload=?").bind(JSON.stringify(config),now(),actor.id,old.payload),db.prepare("INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) SELECT ?,'修改分配规则','all',?,?,? WHERE changes()>0").bind(id(),JSON.stringify({before:JSON.parse(old.payload).performance,after:config.performance}),now(),actor.id)]);if(!result[0].meta.changes)throw new Problem('分配规则已更新，请刷新',409);return {ok:true};
 }
 if(path==='allocation/management/adjustment'){
  if(!validMonth(body.month)||body.month<monthNow()||body.month>nextMonth(monthNow()))throw new Problem('只能调整本月或下月的分配档位');
  const person=await db.prepare("SELECT id FROM crm_users WHERE id=? AND active=1 AND (role IN ('sales','management','ceo') OR (role='followup' AND EXISTS(SELECT 1 FROM json_each(trade_scopes) WHERE value='domestic')))").bind(body.user_id).first();if(!person)throw new Problem('请选择有效业务员');
  if(!['manual','auto'].includes(body.mode)||!['pending','qualified','unqualified'].includes(body.assessment)||!['0','20','50','80','pause','review'].includes(body.tier))throw new Problem('调整选项无效');
  const reason=typeof body.reason==='string'?body.reason.trim():'';if(body.mode==='manual'&&(!reason||reason.length>160))throw new Problem('请填写160字内的调整原因');
  const scope='performance:'+body.month+':'+body.user_id,old=await db.prepare('SELECT payload FROM crm_allocation_configs WHERE scope=?').bind(scope).first<any>(),version=old?JSON.parse(old.payload).version:0;
  if(body.version!==version)throw new Problem('人工档位已更新，请刷新',409);
  const next={mode:body.mode,assessment:body.mode==='auto'?'pending':body.assessment,tier:body.tier,reason:body.mode==='auto'?'恢复跟随规则':reason,version:version+1};
  const result=await db.batch([db.prepare('INSERT INTO crm_allocation_configs(scope,payload,updated,updated_by) VALUES(?,?,?,?) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload,updated=excluded.updated,updated_by=excluded.updated_by WHERE crm_allocation_configs.payload=?').bind(scope,JSON.stringify(next),now(),actor.id,old?.payload||''),db.prepare("INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) SELECT ?,'人工调整分配档位',?,?,?,? WHERE changes()>0").bind(id(),body.user_id,JSON.stringify({month:body.month,before:old?JSON.parse(old.payload):null,after:next}),now(),actor.id)]);if(!result[0].meta.changes)throw new Problem('人工档位已更新，请刷新',409);return {ok:true};
 }
 throw new Problem('操作不存在',404);
}
