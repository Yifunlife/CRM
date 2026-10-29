import {authorizedLead,can,clean,id,now} from './crm';
import {AllocationError} from './allocation-server';
import {salesState,salesSummary,SALES_STAGES} from './sales-pipeline';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
const required=(value:any,label:string)=>{const text=clean(value,2000);if(!text)fail('请填写'+label);return text;};
function occurred(value:any,timestamp:string){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,19)!==value.slice(0,19)||Date.parse(value)>Date.parse(timestamp))fail('请填写真实发生时间，不能晚于当前时间');return new Date(value).toISOString();}
async function visibleOrders(db:D1Database,user:any,leadId=''){
 const all=can(user,'followup_all')||can(user,'followup_edit')||!!await db.prepare('SELECT user_id FROM crm_followup_staff WHERE user_id=?').bind(user.id).first();
 const rows=(await db.prepare(`SELECT o.id,o.lead_id,o.deal_id,o.order_number,o.project,o.archived,o.details,c.name AS commercial_name,s.name AS logistics_name FROM crm_followup_orders o JOIN crm_users c ON c.id=o.commercial_id JOIN crm_users s ON s.id=o.logistics_id WHERE ${can(user,'customers_all')?'1=1':'EXISTS(SELECT 1 FROM crm_leads l WHERE l.id=o.lead_id AND l.owner_id=?)'}${all?'':' AND o.commercial_id=?'}${leadId?' AND o.lead_id=?':''}`).bind(...(can(user,'customers_all')?[]:[user.id]),...(all?[]:[user.id]),...(leadId?[leadId]:[])).all<any>()).results;
 return rows.map(o=>{const details=JSON.parse(o.details);return {id:o.id,lead_id:o.lead_id,deal_id:o.deal_id,order_number:o.order_number,project:o.project,archived:o.archived,commercial_name:o.commercial_name,logistics_name:o.logistics_name,production_date:details.dates?.production_ordered?.date||'',purchase_date:details.dates?.purchase_ordered?.date||'',production_progress:details.production_progress||'',purchase_progress:details.purchase_progress||'',planned_ship:details.dates?.planned_ship?.date||'',actual_ship:details.dates?.actual_ship?.date||''};});
}
export async function salesPipelineEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 if(!path.startsWith('sales-pipeline'))return undefined;
 const timestamp=now();
 if(path==='sales-pipeline'&&method==='GET'){
  const all=can(user,'customers_all'),where=all?'':' WHERE l.owner_id=?',args=all?[]:[user.id];
  const leads=(await db.prepare('SELECT l.*,u.name AS owner_name,(SELECT MAX(a.created) FROM crm_assignments a WHERE a.lead_id=l.id AND a.owner_id=l.owner_id) AS assigned_at FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id'+where).bind(...args).all<any>()).results;
  const deals=(await db.prepare('SELECT d.id,d.lead_id,EXISTS(SELECT 1 FROM crm_followup_orders o WHERE o.deal_id=d.id) AS has_order FROM crm_deals d JOIN crm_leads l ON l.id=d.lead_id WHERE d.cancelled=0'+(all?'':' AND l.owner_id=?')).bind(...args).all<any>()).results;
  const orders=await visibleOrders(db,user);
  const byLead=(items:any[])=>{const map=new Map<string,any[]>();for(const item of items){const group=map.get(item.lead_id)||[];group.push(item);map.set(item.lead_id,group);}return map;};
  const orderMap=byLead(orders),dealMap=byLead(deals);
  const rows=leads.map(l=>{const {state,required,...row}=salesSummary(l,timestamp,orderMap.get(l.id)||[],dealMap.get(l.id)||[]);return row;});
  const people=(await db.prepare("SELECT id,name,active FROM crm_users WHERE "+(all?"role='sales' OR EXISTS(SELECT 1 FROM crm_leads l WHERE l.owner_id=crm_users.id)":'id=?')+' ORDER BY name,id').bind(...args).all<any>()).results;
  return {rows,people,at:timestamp,timezone:'Asia/Shanghai'};
 }
 const match=/^sales-pipeline\/([a-zA-Z0-9_-]+)$/.exec(path);if(!match)fail('销售流程操作不存在',404);
 const lead:any=await db.prepare('SELECT l.*,u.name AS owner_name,(SELECT MAX(a.created) FROM crm_assignments a WHERE a.lead_id=l.id AND a.owner_id=l.owner_id) AS assigned_at FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id WHERE l.id=?').bind(match![1]).first();
 if(!lead||!authorizedLead(user,lead))fail('客户不存在或无权查看',404);
 if(method==='GET'){
  const deals=(await db.prepare('SELECT d.id,EXISTS(SELECT 1 FROM crm_followup_orders o WHERE o.deal_id=d.id) AS has_order FROM crm_deals d WHERE d.lead_id=? AND d.cancelled=0').bind(lead.id).all()).results;
  const history=(await db.prepare("SELECT e.id,e.payload,e.created,u.name AS author FROM crm_attribution_events e JOIN crm_users u ON u.id=e.created_by WHERE e.entity_id=? AND e.kind='销售流程记录' ORDER BY e.created DESC,e.rowid DESC LIMIT 100").bind(lead.id).all<any>()).results.map(e=>({...e,payload:JSON.parse(e.payload)}));
  return {...salesSummary(lead,timestamp,await visibleOrders(db,user,lead.id),deals),history};
 }
 if(method!=='POST')fail('不支持此操作',405);
 if(!can(user,'customers_edit'))fail('没有客资维护权限',403);
 const before=salesState(lead),state=structuredClone(before),at=occurred(body.at,timestamp),note=required(body.note,'记录依据／沟通内容');
 if(body.version!==before.version)fail('客户流程已更新，请刷新后重试',409);
 let lastContact=lead.last_contact,status=lead.status;
 if(body.action==='contact'){
  if(!['first','second'].includes(body.round)||!['whatsapp','email'].includes(body.channel))fail('请选择联系轮次和渠道');
  if(!state.required)state.required=[...(lead.phone?['whatsapp']:[]),...(lead.email?['email']:[])];
  if(!state.required.includes(body.channel))fail('请先补充该渠道的联系方式');
  const summary=salesSummary(lead,timestamp),round=body.round as 'first'|'second';
  if(round==='second'&&(!summary.first_at||at<=summary.first_at))fail('完成全部可用渠道的首次联系后，才能记录第二次跟进');
  if(state[round][body.channel])fail('此轮该渠道已有完成记录；请保留原记录，后续沟通填写普通跟进',409);
  state[round][body.channel]={at,note};
  if(at>lastContact)lastContact=at;
  if(status==='待首次联系')status='已联系待回复';
 }else if(body.action==='reply'){
  if(state.reply_at&&at<=state.reply_at)fail('客户回复时间需晚于已记录的最后回复');
  state.reply_at=at;if(!state.stage){state.stage='replied';state.stage_at=at;}
  if(at>lastContact)lastContact=at;
  if(['待首次联系','已联系待回复'].includes(status))status='正在沟通';
 }else if(body.action==='stage'){
  if(!SALES_STAGES.some(([key])=>key===body.stage))fail('请选择有效的客户阶段');
  if(body.stage==='replied'&&!state.reply_at)fail('请先记录客户实际回复时间');
  if(state.stage!==body.stage){if(state.stage_at&&at<state.stage_at)fail('新阶段开始时间不能早于当前阶段');state.stage=body.stage;state.stage_at=at;}
  if(!['已成交','已结束','暂停跟进'].includes(status))status='正在沟通';
 }else fail('销售流程操作不存在',404);
 if(['已成交','已结束'].includes(lead.status))fail('已成交或已结束客户请在对应订单或原跟进记录处理');
 state.version++;
 const token=id(),payload={action:body.action,round:body.round||'',channel:body.channel||'',at,note,before,after:state};
 const result=await db.batch([
  db.prepare("UPDATE crm_leads SET detail=json_set(detail,'$._sales_progress',json(?)),last_contact=?,status=? WHERE id=? AND COALESCE(json_extract(detail,'$._sales_progress.version'),0)=? AND owner_id IS ? AND status=? AND last_contact=?").bind(JSON.stringify(state),lastContact,status,lead.id,before.version,lead.owner_id,lead.status,lead.last_contact),
  db.prepare("INSERT INTO crm_attribution_events(id,kind,entity_id,payload,created,created_by) SELECT ?,'销售流程记录',?,?,?,? WHERE changes()>0").bind(token,lead.id,JSON.stringify(payload),timestamp,actor.id),
  db.prepare("INSERT INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) SELECT ?,?,?,?,?,'',? WHERE EXISTS(SELECT 1 FROM crm_attribution_events WHERE id=?)").bind(token,lead.id,actor.id,note,body.action==='stage'?'销售阶段':body.action==='reply'?'客户回复':(body.round==='first'?'首次':'二次')+(body.channel==='whatsapp'?'WhatsApp':'邮件'),at,token)
 ]);
 if(!result[0].meta.changes)fail('客户资料已变化，请刷新后重试',409);
 return {ok:true};
}
