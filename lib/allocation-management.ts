import {customerLeadSQL} from './contact-kind';
import {allocationRecipientMarket} from './allocation-intake';
import {customerMarket} from './operations-dashboard';
import {allocationWeights} from './allocation-server';
import {ALLOCATION_START,cumulativeAllocationCounts,fullLeadSQL} from './allocation-priority';
import {canSetManagement,can,digest,id,now} from './crm';
import {Problem} from './api/http';
import {customerPage} from './customer-page';
import {customerAllocationSummary} from './customer-allocation-summary';
import {customerOrigin} from './customer-origin';
import {assignmentFields} from './assignment-reminders';
import {suiteDay} from './sales-suite';

export async function allocationMediaSummary(db:D1Database,user:any,today=suiteDay(),market=''){
 const summary:any=await customerAllocationSummary(db,user,today),all=can(user,'customers_all');
 const events=(await db.prepare(`SELECT a.owner_id,a.lead_id,l.source,l.channel,l.detail,l.country,l.business_scope,${assignmentFields},
 (SELECT raw FROM crm_form_submissions s WHERE s.lead_id=l.id AND s.kind='new' ORDER BY s.occurred,s.id LIMIT 1) original
 FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE ${customerLeadSQL()} AND l.review=0 AND a.policy<>'test-simulation' ${all?'':'AND a.owner_id=?'}`).bind(...(all?[]:[user.id])).all<any>()).results;
 if(market){for(const row of summary.rows){row.today=0;row.month=0;row.cumulative=0;}summary.today=0;summary.month=0;summary.cumulative=0;}
 const seen=new Set<string>();summary.media={today:{},month:{},cumulative:{}};
 for(const r of summary.rows)r.media={today:{},month:{},cumulative:{}};
 for(const e of events){
  if(market&&customerMarket(e)!==market)continue;
  if(e.legacy_sync||['historical-sheet-v1','historical-alignment','historical-sync'].includes(e.assignment_policy)||!Number.isFinite(Date.parse(e.assigned_at)))continue;
  const date=new Date(e.assigned_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});if(date>today)continue;
  const row=summary.rows.find((r:any)=>r.id===e.owner_id);if(!row)continue;
  const platform=customerOrigin(e,e.original).display_source;
  for(const period of ['today','month','cumulative']){
   if(period==='today'&&date!==today||period==='month'&&date.slice(0,7)!==today.slice(0,7))continue;
   const key=JSON.stringify([e.owner_id,e.lead_id,period]);if(seen.has(key))continue;seen.add(key);
   if(market){row[period]++;summary[period]++;}row.media[period][platform]=(row.media[period][platform]||0)+1;summary.media[period][platform]=(summary.media[period][platform]||0)+1;
  }
 }
 return summary;
}
const eligible="COALESCE(grade,'') NOT IN ('Yifun Staff','同事') AND cohort='new' AND owner_id IS NULL AND original_owner='' AND review=0";
function identifiers(value:any,label:string,max:number){if(!Array.isArray(value)||!value.length||value.length>max||value.some(v=>typeof v!=='string'||!v||v.length>200)||new Set(value).size!==value.length)throw new Problem(label);return [...value].sort() as string[];}
async function manualPlan(db:D1Database,body:any){
 const ids=identifiers(body.ids,'每次选择1至200位客户',200),recipients=identifiers(body.recipients,'请选择有效接收人员',100);
 const leads=(await db.prepare(`SELECT id,name,business_scope,country,detail,source,${fullLeadSQL('crm_leads')} AS is_full FROM crm_leads WHERE id IN (SELECT value FROM json_each(?)) AND ${eligible} ORDER BY is_full DESC,entered,id`).bind(JSON.stringify(ids)).all<any>()).results;
 if(body.market&&leads.some(l=>customerMarket(l)!==body.market))throw new Problem('不能跨内外贸分配，请刷新后重新选择',409);
 if(leads.length!==ids.length)throw new Problem('客户归属或核查状态已变化，请刷新后重新选择',409);
 const {weights,adjusted}=await allocationWeights(db);if(recipients.some(id=>!weights.some(w=>w.user_id===id)))throw new Problem('接收人员不在参与名单中，或已请假、暂停，请重新选择',409);
 const people=(await db.prepare("SELECT id,name,role,trade_scopes FROM crm_users WHERE id IN (SELECT value FROM json_each(?)) AND active=1 AND role IN ('sales','management','ceo') ORDER BY id").bind(JSON.stringify(recipients)).all<any>()).results;
 if(body.market&&people.some(p=>!allocationRecipientMarket(p,body.market)))throw new Problem('接收人员业务范围与客资不一致',409);
 if(people.length!==recipients.length)throw new Problem('接收人员已停用或不再具备接收资格，请重新选择',409);
 const totals=await cumulativeAllocationCounts(db);
 const counts=people.map(p=>({...p,weight:adjusted?(weights.find(w=>w.user_id===p.id)?.share||1):1,before:totals.find(r=>r.owner_id===p.id)?.total||0,full_before:totals.find(r=>r.owner_id===p.id)?.full_count||0,assigned:0,full_assigned:0}));
 const rows=leads.map(l=>{counts.sort((a,b)=>(l.is_full?(a.full_before+a.full_assigned)/a.weight-(b.full_before+b.full_assigned)/b.weight:0)||(a.before+a.assigned)/a.weight-(b.before+b.assigned)/b.weight||a.id.localeCompare(b.id));const pick=counts[0];pick.assigned++;if(l.is_full)pick.full_assigned++;return {...l,owner_id:pick.id,owner_name:pick.name};});
 const token=await digest(JSON.stringify({policy:'full-first-v1',rows,counts:counts.sort((a,b)=>a.id.localeCompare(b.id))}));
 return {rows,people:counts,token,ids,recipients};
}
export async function allocationManagementEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any,url:URL){
 if(!path.startsWith('allocation/management'))return undefined;
 if(!can(user,'customers_all')||!can(user,'performance_view'))throw new Problem('此页面需要客户管理及分配权限',403);
 if(path==='allocation/management'&&method==='GET'){
  const market=url.searchParams.get('market')||'',platform=url.searchParams.get('platform')||'',account=url.searchParams.get('account')||'';if(market&&!['内贸','外贸','待确认'].includes(market))throw new Problem('请选择有效业务范围');
  const queue=url.searchParams.get('queue')||'待分配',query=new URL(url),from=url.searchParams.get('from')??'2026-10-29',to=url.searchParams.get('to')??suiteDay();
  for(const date of [from,to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw new Problem('请选择有效的起止日期');
  if(from&&to&&from>to)throw new Problem('开始日期不能晚于结束日期');
  query.searchParams.delete('queue');query.searchParams.delete('cohort');if(queue==='待分配')query.searchParams.delete('stage');else query.searchParams.set('stage',queue==='已有归属'?'已分配':queue);
  const [page,summary,people,config,roster]=await Promise.all([customerPage(db,user,query,{unassignedOnly:queue==='待分配',from,to,market,platform,account}),allocationMediaSummary(db,user,suiteDay(),market),db.prepare("SELECT id,name,role,trade_scopes FROM crm_users WHERE active=1 AND role IN ('sales','management','ceo') ORDER BY name,id").all<any>(),db.prepare("SELECT payload FROM crm_allocation_configs WHERE scope='all'").first<any>(),allocationWeights(db)]);
  if(market)summary.rows=summary.rows.filter((r:any)=>r.cumulative>0||people.results.some(p=>p.id===r.id&&allocationRecipientMarket(p,market)));
  return {...page,from,to,market,summary,people:people.results.filter(p=>roster.weights.some(w=>w.user_id===p.id)&&(!market||allocationRecipientMarket(p,market))),allocationPolicy:'full-first-v1',allocationStart:ALLOCATION_START,automatic:config?JSON.parse(config.payload).rule?.automatic===true:false};
 }
 if(path==='allocation/management/records'&&method==='GET'){
  const page=Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1)),base=`WITH records AS (
   SELECT a.id,'客户分配' kind,a.created,l.name customer,u.name recipient,p.name author,a.policy detail FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id LEFT JOIN crm_users u ON u.id=a.owner_id LEFT JOIN crm_users p ON p.id=a.user_id
   UNION ALL SELECT w.id,w.kind,w.created,COALESCE(l.name,target.name),target.name,p.name,COALESCE(json_extract(w.payload,'$.after.reason'),json_extract(w.payload,'$.operation')) FROM crm_workflow_audit w LEFT JOIN crm_leads l ON l.id=w.entity_id LEFT JOIN crm_users p ON p.id=w.created_by LEFT JOIN crm_users target ON target.id=w.entity_id WHERE w.kind IN ('撤销客资分配','人工调整分配档位','修改分配规则','表单去重与规则分配')
   UNION ALL SELECT b.id,'表单导入',b.created,b.filename,NULL,u.name,CAST(b.total AS TEXT)||' 条原始记录' FROM crm_batches b LEFT JOIN crm_users u ON u.id=b.creator
  )`;
  const count=await db.prepare(base+' SELECT COUNT(*) total FROM records').first<any>();
  const rows=(await db.prepare(base+' SELECT * FROM records ORDER BY created DESC,id LIMIT 30 OFFSET ?').bind((page-1)*30).all<any>()).results;
  return {rows,total:count.total,page};
 }
 if(method!=='POST'||!['allocation/management/preview','allocation/management/confirm'].includes(path))throw new Problem('操作不存在',404);
 if(!canSetManagement(actor)||!canSetManagement(user)||actor.id!==user.id)throw new Problem('此账号只能查看，不能分配客户',403);
 const plan=await manualPlan(db,body);if(path.endsWith('/preview'))return plan;
 if(typeof body.token!=='string'||body.token!==plan.token)throw new Problem('分配预览已变化，请重新预览并确认',409);
 const at=now(),operation=id(),ids=JSON.stringify(plan.ids),recipients=JSON.stringify(plan.recipients);
 // D1 batch is transactional. Fail the whole batch if any customer or recipient changed after preview.
 const guard=db.prepare(`SELECT CASE WHEN (SELECT COUNT(*) FROM crm_leads WHERE id IN (SELECT value FROM json_each(?)) AND ${eligible})=? AND (SELECT COUNT(*) FROM crm_users WHERE id IN (SELECT value FROM json_each(?)) AND active=1 AND role IN ('sales','management','ceo') AND EXISTS(SELECT 1 FROM crm_allocation_configs cfg,json_each(cfg.payload,'$.members') m WHERE cfg.scope='all' AND json_extract(m.value,'$.user_id')=crm_users.id AND json_extract(m.value,'$.state')='参与'))=? THEN 1 ELSE json('allocation changed') END`).bind(ids,plan.ids.length,recipients,plan.recipients.length);
 const statements=[guard];
 for(const row of plan.rows){
  statements.push(db.prepare(`UPDATE crm_leads SET owner_id=? WHERE id=? AND ${eligible}`).bind(row.owner_id,row.id));
  statements.push(db.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,business_scope,allocation_month,policy) VALUES(?,?,?,?,?,?,?,'full-first-v1')").bind(id(),row.id,actor.id,row.owner_id,at,row.business_scope||'',suiteDay().slice(0,7)));
 }
 statements.push(db.prepare("INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) VALUES(?,'手动客资分配',?,?,?,?)").bind(operation,operation,JSON.stringify({ids:plan.ids,recipients:plan.recipients,rows:plan.rows}),at,actor.id));
 try{await db.batch(statements);}catch(e:any){if(/malformed JSON/i.test(String(e?.message)+' '+String(e?.cause?.message)))throw new Problem('客户或接收人员状态已变化，请刷新后重新预览',409);throw e;}return {assigned:plan.rows.length,operation};
}
