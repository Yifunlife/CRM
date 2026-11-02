import {can,digest,id,now} from './crm';
import {Problem} from './api/http';
import {customerPage} from './customer-page';
import {customerAllocationSummary} from './customer-allocation-summary';
import {customerOrigin} from './customer-origin';
import {assignmentFields} from './assignment-reminders';
import {suiteDay} from './sales-suite';

export async function allocationMediaSummary(db:D1Database,user:any,today=suiteDay()){
 const summary:any=await customerAllocationSummary(db,user,today),all=can(user,'customers_all');
 const events=(await db.prepare(`SELECT a.owner_id,a.lead_id,l.source,l.channel,l.detail,${assignmentFields},
 (SELECT raw FROM crm_form_submissions s WHERE s.lead_id=l.id AND s.kind='new' ORDER BY s.occurred,s.id LIMIT 1) original
 FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE l.review=0 AND a.policy<>'test-simulation' ${all?'':'AND a.owner_id=?'}`).bind(...(all?[]:[user.id])).all<any>()).results;
 const seen=new Set<string>();summary.media={today:{},month:{},cumulative:{}};
 for(const r of summary.rows)r.media={today:{},month:{},cumulative:{}};
 for(const e of events){
  if(e.legacy_sync||['historical-sheet-v1','historical-alignment','historical-sync'].includes(e.assignment_policy)||!Number.isFinite(Date.parse(e.assigned_at)))continue;
  const date=new Date(e.assigned_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});if(date>today)continue;
  const row=summary.rows.find((r:any)=>r.id===e.owner_id);if(!row)continue;
  const platform=customerOrigin(e,e.original).display_source;
  for(const period of ['today','month','cumulative']){
   if(period==='today'&&date!==today||period==='month'&&date.slice(0,7)!==today.slice(0,7))continue;
   const key=JSON.stringify([e.owner_id,e.lead_id,period]);if(seen.has(key))continue;seen.add(key);
   row.media[period][platform]=(row.media[period][platform]||0)+1;summary.media[period][platform]=(summary.media[period][platform]||0)+1;
  }
 }
 return summary;
}
const eligible="cohort='new' AND owner_id IS NULL AND original_owner='' AND review=0";
function identifiers(value:any,label:string,max:number){if(!Array.isArray(value)||!value.length||value.length>max||value.some(v=>typeof v!=='string'||!v||v.length>200)||new Set(value).size!==value.length)throw new Problem(label);return [...value].sort() as string[];}
async function manualPlan(db:D1Database,body:any){
 const ids=identifiers(body.ids,'每次选择1至200位客户',200),recipients=identifiers(body.recipients,'请选择有效接收人员',100);
 const leads=(await db.prepare(`SELECT id,name,business_scope FROM crm_leads WHERE id IN (SELECT value FROM json_each(?)) AND ${eligible} ORDER BY id`).bind(JSON.stringify(ids)).all<any>()).results;
 if(leads.length!==ids.length)throw new Problem('客户归属或核查状态已变化，请刷新后重新选择',409);
 const people=(await db.prepare("SELECT id,name FROM crm_users WHERE id IN (SELECT value FROM json_each(?)) AND active=1 AND role IN ('sales','management','ceo') ORDER BY id").bind(JSON.stringify(recipients)).all<any>()).results;
 if(people.length!==recipients.length)throw new Problem('接收人员已停用或不再具备接收资格，请重新选择',409);
 const totals=(await allocationMediaSummary(db,{role:'admin'},suiteDay())).rows;
 const counts=people.map(p=>({...p,before:totals.find((r:any)=>r.id===p.id)?.month||0,assigned:0}));
 const rows=leads.map(l=>{counts.sort((a,b)=>(a.before+a.assigned)-(b.before+b.assigned)||a.id.localeCompare(b.id));const pick=counts[0];pick.assigned++;return {...l,owner_id:pick.id,owner_name:pick.name};});
 const token=await digest(JSON.stringify({month:suiteDay().slice(0,7),rows,counts:counts.sort((a,b)=>a.id.localeCompare(b.id))}));
 return {rows,people:counts,token,ids,recipients};
}
export async function allocationManagementEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any,url:URL){
 if(!path.startsWith('allocation/management'))return undefined;
 if(!can(user,'customers_all')||!can(user,'leads_allocate')&&user.role!=='ceo')throw new Problem('此页面需要客户管理及分配权限',403);
 if(path==='allocation/management'&&method==='GET'){
  const queue=url.searchParams.get('queue')||'待分配',query=new URL(url);query.searchParams.delete('queue');query.searchParams.set('stage',queue==='已有归属'?'已分配':queue);if(queue==='待分配')query.searchParams.set('cohort','new');
  const [page,summary,people]=await Promise.all([customerPage(db,user,query),allocationMediaSummary(db,user),db.prepare("SELECT id,name FROM crm_users WHERE active=1 AND role IN ('sales','management','ceo') ORDER BY name,id").all<any>()]);
  return {...page,summary,people:people.results,automatic:false};
 }
 if(path==='allocation/management/records'&&method==='GET'){
  const page=Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1)),base=`WITH records AS (
   SELECT a.id,'客户分配' kind,a.created,l.name customer,u.name recipient,p.name author,a.policy detail FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id LEFT JOIN crm_users u ON u.id=a.owner_id LEFT JOIN crm_users p ON p.id=a.user_id
   UNION ALL SELECT w.id,w.kind,w.created,l.name,NULL,p.name,json_extract(w.payload,'$.operation') FROM crm_workflow_audit w LEFT JOIN crm_leads l ON l.id=w.entity_id LEFT JOIN crm_users p ON p.id=w.created_by WHERE w.kind='撤销客资分配'
   UNION ALL SELECT b.id,'表单导入',b.created,b.filename,NULL,u.name,CAST(b.total AS TEXT)||' 条原始记录' FROM crm_batches b LEFT JOIN crm_users u ON u.id=b.creator
  )`;
  const count=await db.prepare(base+' SELECT COUNT(*) total FROM records').first<any>();
  const rows=(await db.prepare(base+' SELECT * FROM records ORDER BY created DESC,id LIMIT 30 OFFSET ?').bind((page-1)*30).all<any>()).results;
  return {rows,total:count.total,page};
 }
 if(method!=='POST'||!['allocation/management/preview','allocation/management/confirm'].includes(path))throw new Problem('操作不存在',404);
 if(!can(actor,'leads_allocate')||!can(user,'leads_allocate')||actor.role==='ceo'||user.role==='ceo')throw new Problem('此账号只能查看，不能分配客户',403);
 const plan=await manualPlan(db,body);if(path.endsWith('/preview'))return plan;
 if(typeof body.token!=='string'||body.token!==plan.token)throw new Problem('分配预览已变化，请重新预览并确认',409);
 const at=now(),operation=id(),ids=JSON.stringify(plan.ids),recipients=JSON.stringify(plan.recipients);
 // D1 batch is transactional. Fail the whole batch if any customer or recipient changed after preview.
 const guard=db.prepare(`SELECT CASE WHEN (SELECT COUNT(*) FROM crm_leads WHERE id IN (SELECT value FROM json_each(?)) AND ${eligible})=? AND (SELECT COUNT(*) FROM crm_users WHERE id IN (SELECT value FROM json_each(?)) AND active=1 AND role IN ('sales','management','ceo'))=? THEN 1 ELSE json('allocation changed') END`).bind(ids,plan.ids.length,recipients,plan.recipients.length);
 const statements=[guard];
 for(const row of plan.rows){
  statements.push(db.prepare(`UPDATE crm_leads SET owner_id=? WHERE id=? AND ${eligible}`).bind(row.owner_id,row.id));
  statements.push(db.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,business_scope,allocation_month,policy) VALUES(?,?,?,?,?,?,?,'manual-v1')").bind(id(),row.id,actor.id,row.owner_id,at,row.business_scope||'',suiteDay().slice(0,7)));
 }
 statements.push(db.prepare("INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) VALUES(?,'手动客资分配',?,?,?,?)").bind(operation,operation,JSON.stringify({ids:plan.ids,recipients:plan.recipients,rows:plan.rows}),at,actor.id));
 await db.batch(statements);return {assigned:plan.rows.length,operation};
}
