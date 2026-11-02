import {authorizedLead,can,clean,id,now,STATUSES} from './crm';
import {AllocationError} from './allocation-server';
import {validateLeadFollowup} from './workflow-server';
import {closingOutcome} from './attribution-server';
import {salesState,salesSummary} from './sales-pipeline';
import {CONTACT_TYPES,CONTACT_RESULTS,CONTACT_ACTIONS,CONTACT_REASONS,validDate,day,daysBetween,openingSchedule,designDeadline,noteType,type OpeningPlan} from './personal-work';
const fail=(s:string,status=400):never=>{throw new AllocationError(s,status);};
const list=async(db:D1Database,sql:string,args:any[]=[]) => (await db.prepare(sql).bind(...args).all<any>()).results;
const parse=(v:string)=>JSON.parse(v||'{}');
const event=(db:D1Database,actor:any,lead:any,kind:string,payload:any,revision?:string)=>db.prepare("INSERT INTO crm_sales_events(id,lead_id,kind,payload,occurred_at,created,created_by) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_leads WHERE id=? AND owner_id IS ?)"+(revision===undefined?'':" AND COALESCE((SELECT id FROM crm_sales_events WHERE lead_id=? AND kind=? AND json_extract(payload,'$.entity')=? ORDER BY created DESC,rowid DESC LIMIT 1),'')=?")).bind(id(),lead.id,kind,JSON.stringify(payload),now(),now(),actor.id,lead.id,lead.owner_id,...(revision===undefined?[]:[lead.id,kind,payload.entity,revision]));
async function customer(db:D1Database,u:any,key:any){const lead:any=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(clean(key,100)).first();if(!lead||!authorizedLead(u,lead))fail('客户不存在或无权查看',404);return lead;}
async function entries(db:D1Database,u:any,leadId=''){
 return (await list(db,`SELECT e.*,l.name AS customer_name,l.owner_id,l.status FROM crm_sales_events e JOIN crm_leads l ON l.id=e.lead_id WHERE e.kind IN ('业务员跟进记录','业务员开业计划','业务员重点项目') AND ${u.role==='sales'||!can(u,'customers_all')?'l.owner_id=?':'1=1'}${leadId?' AND l.id=?':''} ORDER BY e.created DESC,e.rowid DESC`,[...(u.role==='sales'||!can(u,'customers_all')?[u.id]:[]),...(leadId?[leadId]:[])])).map(e=>({...e,payload:parse(e.payload)}));
}
export async function personalWorkEndpoint(db:D1Database,u:any,actor:any,path:string,method:string,body:any,url:URL){
 if(!path.startsWith('personal-work/'))return undefined;
 if(u.role!=='sales'&&!can(u,'customers_all'))fail('无权访问个人业务工作',403);
 if(!['GET','POST'].includes(method))fail('不支持此操作',405);
 if(method==='POST'&&(!can(u,'customers_edit')||!body||typeof body!=='object'))fail('没有客户维护权限',403);
 if(path==='personal-work/customer'&&method==='GET'){
  const lead=await customer(db,u,url.searchParams.get('id')),events=await entries(db,u,lead.id),metadata=new Map(events.filter(e=>e.kind==='业务员跟进记录').map(e=>[e.payload.note_id,e.payload]));
  const notes=(await list(db,'SELECT n.*,u.name AS author FROM crm_notes n JOIN crm_users u ON u.id=n.user_id WHERE n.lead_id=? ORDER BY n.created DESC,n.rowid DESC',[lead.id])).map(n=>({...n,meta:metadata.get(n.id),type:noteType({...n,meta:metadata.get(n.id)})}));
  const progress=await list(db,"SELECT e.*,u.name AS author FROM crm_sales_events e LEFT JOIN crm_sales_projects p ON p.project_id=e.project_id JOIN crm_users u ON u.id=e.created_by WHERE (e.lead_id=? OR p.lead_id=?) AND e.kind NOT IN ('业务员跟进记录','业务员开业计划','业务员重点项目') ORDER BY e.occurred_at DESC,e.created DESC",[lead.id,lead.id]);
  for(const e of progress){const p=parse(e.payload);notes.push({id:'event:'+e.id,created:e.occurred_at,author:e.author,method:'项目推进',type:e.kind,content:p.content||p.result||p.reason||e.kind,next_step:p.next_action||'',meta:null});}
  const deals=await list(db,'SELECT d.*,u.name AS author,c.currency,c.total_minor FROM crm_deals d JOIN crm_users u ON u.id=d.owner_id LEFT JOIN crm_workflow_contracts c ON c.deal_id=d.id WHERE d.lead_id=?',[lead.id]);
  for(const d of deals)notes.push({id:'deal:'+d.id,created:d.deal_date+'T00:00:00+08:00',author:d.author,method:'成交记录',type:'成交与合同',content:d.order_number+' · '+(d.cancelled?'已撤销':d.total_minor==null?'合同金额待核实':d.currency+' '+(d.total_minor/100).toFixed(2)),next_step:'',meta:null});
  const receipts=await list(db,'SELECT r.*,u.name AS author FROM crm_receipts r JOIN crm_deals d ON d.id=r.deal_id JOIN crm_users u ON u.id=r.created_by WHERE d.lead_id=?',[lead.id]);
  for(const r of receipts)notes.push({id:'receipt:'+r.id,created:r.received_date+'T00:00:00+08:00',author:r.author,method:'实际到账',type:'收款记录',content:r.reference+' · '+r.currency+' '+(r.amount_minor/100).toFixed(2)+(r.cancelled?' · 已撤销':''),next_step:'',meta:null});
  const refunds=await list(db,'SELECT f.*,r.currency,u.name AS author FROM crm_workflow_refunds f JOIN crm_receipts r ON r.id=f.receipt_id JOIN crm_deals d ON d.id=r.deal_id JOIN crm_users u ON u.id=f.created_by WHERE d.lead_id=?',[lead.id]);
  for(const r of refunds)notes.push({id:'refund:'+r.id,created:r.refunded_date+'T00:00:00+08:00',author:r.author,method:'实际退款',type:'退款记录',content:r.currency+' '+(r.amount_minor/100).toFixed(2)+' · '+r.reason,next_step:'',meta:null});
  notes.sort((a,b)=>Date.parse(b.created)-Date.parse(a.created));
  const type=url.searchParams.get('type')||'',q=(url.searchParams.get('q')||'').toLowerCase(),matched=notes.filter(n=>(!type||n.type===type)&&(!q||[n.content,n.method,n.next_step,n.created,n.author].join(' ').toLowerCase().includes(q))),pages=Math.max(1,Math.ceil(matched.length/5)),page=Math.min(pages,Math.max(1,Number(url.searchParams.get('page'))||1));
  const plans=new Map<string,any>();for(const e of events.filter(e=>e.kind==='业务员开业计划'))if(!plans.has(e.payload.entity))plans.set(e.payload.entity,{...e.payload,revision:e.id});
  const choices=[...(await list(db,'SELECT project_id AS id,name FROM crm_sales_projects WHERE lead_id=?',[lead.id])).map(p=>({key:'sales:'+p.id,name:p.name})),...(await list(db,`SELECT id,project AS name FROM crm_followup_orders WHERE lead_id=?${u.role==='sales'?' AND commercial_id=?':''}`,[lead.id,...(u.role==='sales'?[u.id]:[])])).map(p=>({key:'order:'+p.id,name:p.name}))];
  if(!choices.length)choices.push({key:'customer:'+lead.id,name:'客户整体开业计划'});
  return {rows:matched.slice((page-1)*5,page*5),total:notes.length,matched:matched.length,pages,page,types:[...new Set(notes.map(n=>n.type))],plans:[...plans.values()],choices,proposal_date:designDeadline(events.filter(e=>e.kind==='业务员跟进记录'))};
 }
 if(path==='personal-work/record'&&method==='POST'){
  const lead=await customer(db,u,body.id),timestamp=now(),type=clean(body.type),result=clean(body.result),note=clean(body.note),action=clean(body.next_action),next=action==='其他'?clean(body.custom_next):action,reason=clean(body.reason);
  if(!CONTACT_TYPES.some(v=>v===type)||!CONTACT_RESULTS.some(v=>v===result)||action&&!CONTACT_ACTIONS.some(v=>v===action)||!STATUSES.includes(body.status))fail('请选择有效的跟进情况、类型、下一步和状态');
  if((result==='其他'||reason==='其他')&&!note)fail('选择其他时请补充备注');
  if(action==='其他'&&!next)fail('请填写具体下一步');
  if(['暂停跟进','已结束'].includes(body.status)&&!CONTACT_REASONS.some(v=>v===reason))fail('请选择暂停或结束原因');
  const at=clean(body.at,40);if(!Number.isFinite(Date.parse(at))||new Date(at).toISOString()!==at||at>timestamp)fail('请填写真实发生时间，不能在未来');
  if(!['WhatsApp','邮件','电话','线上会议','到访公司','其他'].includes(body.method))fail('请选择沟通方式');
  const proposal=clean(body.proposal_date,10),needsProposal=result==='设计已下单'||action==='跟进设计进度';if(needsProposal&&!validDate(proposal)||proposal&&!validDate(proposal))fail('请填写有效的预计出方案日期');
  const content=result+(note?'；备注：'+note:''),date=clean(body.next_date,10);if(date&&!validDate(date))fail('下次跟进日期无效');
  const normalized={...body,content,next_step:next,pause_reason:reason,loss_note:note||reason};await validateLeadFollowup(db,lead,normalized);
  const state=salesState(lead),channel=body.method==='WhatsApp'?'whatsapp':body.method==='邮件'?'email':'',round=type==='首次联系'?'first':type==='二次跟进'?'second':'';
  if(round&&channel&&result!=='未接通 / 未联系上'){
   if(!lead[channel==='whatsapp'?'phone':'email'])fail('请先在客户档案补充该渠道联系方式');
   if(round==='second'&&(!salesSummary(lead,timestamp).first_at||at<=salesSummary(lead,timestamp).first_at))fail('请先记录实际首次联系，再进行二次跟进');
   if(!state[round][channel])state[round][channel]={at,note:content};
  }
  if((result==='客户已回复'||type==='客户实际回复')&&at>state.reply_at)state.reply_at=at;
  if(result==='设计已下单'&&(!state.stage_at||at>=state.stage_at)){state.stage='design';state.stage_at=at;}
  state.version++;
  const token=id(),metadata={note_id:token,type,result,note,next_action:next,next_date:date,proposal_date:needsProposal?proposal:'',reason,status:body.status};
  const outcome=await closingOutcome(db,lead,normalized,actor);
  let writes;try{writes=await db.batch([db.prepare("UPDATE crm_leads SET status=?,next_date=?,last_contact=?,detail=json_set(detail,'$._sales_progress',json(?)) WHERE id=? AND owner_id IS ? AND detail=?").bind(body.status,date,result!=='未接通 / 未联系上'&&at>lead.last_contact?at:lead.last_contact,JSON.stringify(state),lead.id,lead.owner_id,lead.detail),db.prepare('INSERT INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES(CASE WHEN changes()>0 THEN ? ELSE NULL END,?,?,?,?,?,?)').bind(token,lead.id,actor.id,content,body.method,next,at),db.prepare("INSERT INTO crm_sales_events(id,lead_id,kind,payload,occurred_at,created,created_by) SELECT ?,?,'业务员跟进记录',?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_notes WHERE id=?)").bind(token,lead.id,JSON.stringify(metadata),at,timestamp,actor.id,token),...outcome]);}catch(e){if(String((e as Error).message).includes('crm_notes.id'))fail('客户资料或归属已变化，请刷新后重试',409);throw e;}
  if(!writes[0].meta.changes)fail('客户资料或归属已变化，请刷新后重试',409);return {ok:true};
 }
 if(path==='personal-work/plan'&&method==='POST'){
  const lead=await customer(db,u,body.id),p=body.plan as OpeningPlan;
  if(!p||!validDate(p.opening)||!Number.isInteger(p.phase)||p.phase<0||p.phase>4||!Array.isArray(p.days)||p.days.length!==5||[...p.days,p.remaining,p.buffer,p.remind].some(n=>!Number.isInteger(n)||n<0||n>365))fail('请填写有效开业日期与各环节周期');
  const [kind,key]=String(p.entity).split(':');if(!['sales','order','customer'].includes(kind)||kind==='customer'&&key!==lead.id)fail('请选择关联项目');
  const row=kind==='customer'?{lead_id:lead.id}:await db.prepare(kind==='sales'?'SELECT lead_id FROM crm_sales_projects WHERE project_id=?':'SELECT lead_id,commercial_id FROM crm_followup_orders WHERE id=?').bind(key).first<any>();if(!row||row.lead_id!==lead.id||kind==='order'&&u.role==='sales'&&row.commercial_id!==u.id)fail('项目不存在或无权维护',404);
  const latest=await db.prepare("SELECT id FROM crm_sales_events WHERE lead_id=? AND kind='业务员开业计划' AND json_extract(payload,'$.entity')=? ORDER BY created DESC,rowid DESC LIMIT 1").bind(lead.id,p.entity).first<any>();if((latest?.id||'')!==(body.revision||''))fail('计划已更新，请刷新后重试',409);
  const saved=await event(db,actor,lead,'业务员开业计划',p,body.revision||'').run();if(!saved.meta.changes)fail('计划或归属已变化，请刷新',409);return {ok:true};
 }
 if(path==='personal-work/priority'&&method==='POST'){
  const lead=await customer(db,u,body.id),[kind,key]=String(body.entity).split(':');if(!['sales','order'].includes(kind)||typeof body.marked!=='boolean')fail('请选择有效项目');
  const row=await db.prepare(kind==='sales'?'SELECT lead_id FROM crm_sales_projects WHERE project_id=?':'SELECT lead_id,commercial_id FROM crm_followup_orders WHERE id=?').bind(key).first<any>();if(!row||row.lead_id!==lead.id||kind==='order'&&u.role==='sales'&&row.commercial_id!==u.id)fail('项目不存在或无权维护',404);
  const saved=await event(db,actor,lead,'业务员重点项目',{entity:body.entity,marked:body.marked,owner_id:u.id}).run();if(!saved.meta.changes)fail('项目归属已变化，请刷新',409);return {ok:true};
 }
 if(path==='personal-work/report'&&method==='GET'){
  if(u.role!=='sales')fail('此工作台只用于本人业务',403);
  const today=day(),events=await entries(db,u),reminders:any[]=[],priority=new Map<string,boolean>(),plans=new Map<string,any>();
  for(const e of events){if(e.kind==='业务员重点项目'&&e.payload.owner_id===u.id&&!priority.has(e.payload.entity))priority.set(e.payload.entity,!!e.payload.marked);if(e.kind==='业务员开业计划'&&!plans.has(e.payload.entity))plans.set(e.payload.entity,e);}
  const ids=[...new Set(events.filter(e=>e.kind==='业务员跟进记录'&&e.status!=='已结束').map(e=>e.lead_id))];
  for(const lead of ids){const own=events.filter(e=>e.lead_id===lead&&e.kind==='业务员跟进记录'),date=designDeadline(own);if(date&&daysBetween(date,today)<=2){const due=daysBetween(date,today);reminders.push({id:'design:'+lead,lead_id:lead,name:own[0].customer_name,title:'跟进设计进度',date,label:due<0?'出方案已逾期 '+(-due)+' 天':due===0?'今天出方案':'快到期 · 剩 '+due+' 天',rank:due<0?0:1,kind:'设计出方案'});}}
  for(const e of plans.values()){const p=e.payload;if(e.status==='已结束')continue;const s=openingSchedule(p,today);if(s.due<=p.remind||s.late>0||s.slack<=p.remind)reminders.push({id:'opening:'+p.entity,lead_id:e.lead_id,name:e.customer_name,title:OPENING_TITLE(p.phase),date:s.latest[p.phase].finish,label:s.due<0?'已逾期 '+(-s.due)+' 天':s.due<=p.remind?s.due===0?'今天截止':'快到期 · 剩 '+s.due+' 天':s.text,rank:s.due<0?0:s.due<=p.remind?1:3,kind:'开业倒排',forecast:s.text});}
  const newLeads=await list(db,`SELECT l.id,l.name,l.country,l.source,l.channel,l.status,
   EXISTS(SELECT 1 FROM crm_workbench_links w WHERE w.lead_id=l.id AND w.owner_id=l.owner_id) AS workbench_added
   FROM crm_leads l WHERE l.owner_id=? AND l.review=0 AND (
    (l.cohort='new' AND date(l.created,'+8 hours')=?) OR EXISTS(
     SELECT 1 FROM crm_assignments a WHERE a.lead_id=l.id AND a.owner_id=l.owner_id
     AND a.policy IN ('full-first-v1','manual-v1','equal-v1','equal-global-v1') AND date(a.created,'+8 hours')=?))
   ORDER BY l.created DESC,l.id`,[u.id,today,today]);
  const tasks=await list(db,"SELECT t.id,t.title,t.status,t.due_at,t.next_action,t.lead_id,t.order_id FROM crm_sales_tasks t JOIN crm_leads l ON l.id=t.lead_id WHERE t.owner_id=? AND l.owner_id=? AND t.status IN ('open','done') AND date(t.due_at,'+8 hours')<=? ORDER BY t.due_at",[u.id,u.id,today]);
  const orderTasks=await list(db,"SELECT t.status FROM crm_followup_tasks t JOIN crm_followup_orders o ON o.id=t.order_id JOIN crm_leads l ON l.id=o.lead_id WHERE t.owner_id=? AND l.owner_id=? AND date(t.due_at,'+8 hours')<=? AND t.status IN ('待处理','已解决')",[u.id,u.id,today]);
  return {today,newLeads,reminders:reminders.sort((a,b)=>a.rank-b.rank||a.date.localeCompare(b.date)),priorities:[...priority].filter(([,v])=>v).map(([k])=>k),tasks,taskCompletion:{total:tasks.length+orderTasks.length,done:tasks.filter(t=>t.status==='done').length+orderTasks.filter(t=>t.status==='已解决').length}};
 }
 fail('个人业务操作不存在',404);
}
const OPENING_TITLE=(phase:number)=>['方案与合同确认','生产','运输与清关','安装调试','开业准备'][phase]+'须按倒排计划完成';
