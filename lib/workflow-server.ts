import {AllocationError} from './allocation-server';
import {id,now,clean,authorizedLead,can} from './crm';
import {chinaToday,nextChinaWorkday} from './china-workdays';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
const required=(v:any,label:string)=>{const s=clean(v,2000);if(!s)fail('请填写'+label);return s;};
function date(v:any){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail('日期无效');return v;}
function amount(v:any){const s=String(v??'');if(!/^\d+(\.\d{1,2})?$/.test(s))fail('金额须为正数，最多两位小数');const n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n)||n<=0||n>1_000_000_000_000)fail('金额超出范围');return n;}
function admin(user:any,actor:any){if(user.role!=='admin'||actor.role!=='admin')fail('只有管理员可以确认此操作',403);}
export function workflowAudit(db:D1Database,actor:any,kind:string,entity:string,payload:any,conditional=false){return db.prepare('INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) SELECT ?,?,?,?,?,?'+(conditional?' WHERE changes()>0':'')).bind(id(),kind,entity,JSON.stringify(payload),now(),actor.id);}
async function dealAccess(db:D1Database,user:any,dealId:string){const row:any=await db.prepare('SELECT d.*,l.owner_id AS current_owner FROM crm_deals d JOIN crm_leads l ON l.id=d.lead_id WHERE d.id=?').bind(dealId).first();if(!row||!authorizedLead(user,{owner_id:row.current_owner}))fail('成交不存在或无权查看',404);return row;}
export async function paymentSummary(db:D1Database,dealId:string){
 const contract:any=await db.prepare('SELECT * FROM crm_workflow_contracts WHERE deal_id=?').bind(dealId).first();
 const receipts=(await db.prepare('SELECT r.*,COALESCE((SELECT SUM(amount_minor) FROM crm_workflow_refunds f WHERE f.receipt_id=r.id),0) AS refunded_minor FROM crm_receipts r WHERE r.deal_id=? ORDER BY r.received_date,r.created,r.id').bind(dealId).all<any>()).results;
 if(!contract)return {contract:null,receipts,net_minor:0,cross_currency:false,ship_due_minor:0,outstanding_minor:null,overdue_minor:null};
 contract.schedule=JSON.parse(contract.schedule);
 const valid=receipts.filter(r=>!r.cancelled),net=valid.filter(r=>r.currency===contract.currency).reduce((n,r)=>n+r.amount_minor-r.refunded_minor,0);
 return {contract,receipts,net_minor:net,cross_currency:valid.some(r=>r.currency!==contract.currency),ship_due_minor:contract.schedule.filter((p:any)=>p.before_ship).reduce((n:number,p:any)=>n+p.amount_minor,0),outstanding_minor:Math.max(0,contract.total_minor-net),overdue_minor:Math.max(0,contract.schedule.filter((p:any)=>p.due_date<chinaToday()).reduce((n:number,p:any)=>n+p.amount_minor,0)-net)};
}
export async function validateLeadFollowup(db:D1Database,lead:any,body:any){
 if(body.status==='已成交'&&!await db.prepare('SELECT id FROM crm_deals WHERE lead_id=? AND cancelled=0').bind(lead.id).first())fail('标记已成交前需管理员确认有效成交单');
 if(!['已成交','已结束'].includes(body.status)){date(body.next_date);if(body.next_date<chinaToday())fail('下次跟进或复查日期不能早于今天');}
 if(body.status==='暂停跟进')required(body.pause_reason,'暂停原因');
}
const handoverKinds:Record<string,{table:string;field:string;label:string}>={customer:{table:'crm_leads',field:'owner_id',label:'客户'},commercial:{table:'crm_followup_orders',field:'commercial_id',label:'订单商务'},logistics:{table:'crm_followup_orders',field:'logistics_id',label:'订单后勤'},task:{table:'crm_followup_tasks',field:'owner_id',label:'未结任务'}};
async function handoverTarget(db:D1Database,kind:string,entity:string){const spec=handoverKinds[kind];if(!spec)fail('交接类型无效');const row:any=await db.prepare(`SELECT * FROM ${spec.table} WHERE id=?`).bind(entity).first();if(!row||!row[spec.field]||kind==='task'&&row.status!=='待处理'||['commercial','logistics'].includes(kind)&&row.archived)fail('交接对象不存在或已结束');return {spec,row};}
export async function workflowEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 if(!path.startsWith('workflow/'))return undefined;
 if(path==='workflow/report'&&method==='GET'){
  const all=can(user,'customers_all'),where=user.role==='followup'?' WHERE 0':all?'':' WHERE l.owner_id=?',args=all||user.role==='followup'?[]:[user.id];
  const leads=(await db.prepare('SELECT l.id,l.name,l.owner_id,l.status,l.cohort,l.next_date,l.last_contact,l.created,u.name AS owner_name,u.active AS owner_active,(SELECT MAX(a.created) FROM crm_assignments a WHERE a.lead_id=l.id AND a.owner_id=l.owner_id) AS assigned_at,(SELECT COUNT(*) FROM crm_deals d WHERE d.lead_id=l.id AND d.cancelled=0) AS deal_count FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id'+where).bind(...args).all<any>()).results;
  const issues:any[]=[];const add=(kind:string,entity_id:string,name:string,owner:string,issue:string,due='')=>issues.push({kind,entity_id,name,owner,issue,due});
  for(const l of leads){
   if(l.status==='已成交'&&!l.deal_count)add('customer',l.id,l.name,l.owner_name,'已成交但无有效成交单，待核查');
   if(l.deal_count&&!['已成交','已结束'].includes(l.status))add('customer',l.id,l.name,l.owner_name,'已有成交仍在跟进，核查是否复购');
   if(l.owner_id&&l.owner_active===0)add('customer',l.id,l.name,l.owner_name,'负责人停用，待交接');
   if(['已成交','已结束'].includes(l.status))continue;
   if(!l.next_date)add('customer',l.id,l.name,l.owner_name,'缺少下次跟进／复查日期，待核查');
   else if(l.next_date<chinaToday())add('customer',l.id,l.name,l.owner_name,'跟进／复查逾期',l.next_date);
   if(l.cohort==='new'&&l.owner_id&&!l.last_contact){const due=nextChinaWorkday(l.assigned_at);if(!due)add('customer',l.id,l.name,l.owner_name,'首次联系期限待核查：缺分配时间或法定工作日日历');else if(due<=chinaToday())add('customer',l.id,l.name,l.owner_name,due<chinaToday()?'首次联系逾期':'今日须首次联系',due);}
  }
  const deals=(await db.prepare('SELECT d.*,l.name AS customer_name FROM crm_deals d JOIN crm_leads l ON l.id=d.lead_id'+where+' ORDER BY d.created DESC').bind(...args).all<any>()).results;
  // Read all payment rows once, avoiding per-customer queries in the report.
  const contracts=(await db.prepare('SELECT c.* FROM crm_workflow_contracts c JOIN crm_deals d ON d.id=c.deal_id JOIN crm_leads l ON l.id=d.lead_id'+where).bind(...args).all<any>()).results;
  const receiptRows=(await db.prepare('SELECT r.*,COALESCE((SELECT SUM(f.amount_minor) FROM crm_workflow_refunds f WHERE f.receipt_id=r.id),0) AS refunded_minor FROM crm_receipts r JOIN crm_deals d ON d.id=r.deal_id JOIN crm_leads l ON l.id=d.lead_id'+where).bind(...args).all<any>()).results;
  for(const d of deals){d.contract=contracts.find(c=>c.deal_id===d.id)||null;if(d.contract)d.contract={...d.contract,schedule:JSON.parse(d.contract.schedule)};d.receipts=receiptRows.filter(r=>r.deal_id===d.id);const c=d.contract,valid=d.receipts.filter((r:any)=>!r.cancelled);d.net_minor=c?valid.filter((r:any)=>r.currency===c.currency).reduce((n:number,r:any)=>n+r.amount_minor-r.refunded_minor,0):0;d.cross_currency=!!c&&valid.some((r:any)=>r.currency!==c.currency);if(d.cancelled)continue;if(!c)add('deal',d.id,d.order_number,'','合同金额／应收计划待核实');else{d.ship_due_minor=c.schedule.filter((p:any)=>p.before_ship).reduce((n:number,p:any)=>n+p.amount_minor,0);d.outstanding_minor=Math.max(0,c.total_minor-d.net_minor);d.overdue_minor=Math.max(0,c.schedule.filter((p:any)=>p.due_date<chinaToday()).reduce((n:number,p:any)=>n+p.amount_minor,0)-d.net_minor);if(d.cross_currency)add('deal',d.id,d.order_number,'','跨币种到账待核查，不自动换算');if(d.overdue_minor)add('deal',d.id,d.order_number,'','应收逾期');}}
  const orderAll=user.role!=='followup'&&(user.role==='admin'||can(user,'followup_all')||can(user,'followup_edit')||!!await db.prepare('SELECT user_id FROM crm_followup_staff WHERE user_id=?').bind(user.id).first());
  const orders=(await db.prepare('SELECT o.*,c.name AS commercial_name,c.active AS commercial_active,s.name AS logistics_name,s.active AS logistics_active FROM crm_followup_orders o JOIN crm_users c ON c.id=o.commercial_id JOIN crm_users s ON s.id=o.logistics_id'+(orderAll?'':user.role==='followup'?' WHERE o.logistics_id=?':' WHERE o.commercial_id=? OR o.logistics_id=? OR EXISTS(SELECT 1 FROM crm_followup_tasks t WHERE t.order_id=o.id AND t.owner_id=?)')).bind(...(orderAll?[]:user.role==='followup'?[user.id]:[user.id,user.id,user.id])).all<any>()).results;
  for(const o of orders){if(o.archived)continue;if(!o.deal_id)add('order',o.id,o.order_number,o.commercial_name,'未关联正式成交单，待核查');else{const d:any=await db.prepare('SELECT cancelled FROM crm_deals WHERE id=?').bind(o.deal_id).first();if(d?.cancelled)add('order',o.id,o.order_number,o.commercial_name,'关联成交已撤销，待核查');}if(!o.commercial_active)add('commercial',o.id,o.order_number,o.commercial_name,'商务负责人停用，待交接');if(!o.logistics_active)add('logistics',o.id,o.order_number,o.logistics_name,'后勤负责人停用，待交接');}
  const tasks=(await db.prepare("SELECT t.*,o.version AS order_version,u.name AS owner_name,u.active AS owner_active FROM crm_followup_tasks t JOIN crm_users u ON u.id=t.owner_id JOIN crm_followup_orders o ON o.id=t.order_id WHERE t.status='待处理'"+(orderAll?'':user.role==='followup'?' AND o.logistics_id=?':' AND t.owner_id=?')).bind(...(orderAll?[]:[user.id])).all<any>()).results;
  for(const t of tasks)if(!t.owner_active)add('task',t.id,t.title,t.owner_name,'任务负责人停用，待交接');
  const handovers=(await db.prepare('SELECT h.*,a.name AS from_name,b.name AS to_name FROM crm_workflow_handovers h JOIN crm_users a ON a.id=h.from_id JOIN crm_users b ON b.id=h.to_id'+(user.role==='admin'?'':' WHERE h.to_id=? OR h.from_id=?')+' ORDER BY h.created DESC').bind(...(user.role==='admin'?[]:[user.id,user.id])).all<any>()).results;
  for(const h of handovers){const spec=handoverKinds[h.kind];const item:any=await db.prepare(`SELECT * FROM ${spec.table} WHERE id=?`).bind(h.entity_id).first();h.label=spec.label+' · '+(item?.name||item?.order_number||item?.title||'待核查');}
  const people=user.role==='admin'?(await db.prepare('SELECT id,name,role,active FROM crm_users ORDER BY name').all()).results:[];
  const audit=user.role==='admin'?(await db.prepare('SELECT a.*,u.name AS actor_name FROM crm_workflow_audit a JOIN crm_users u ON u.id=a.created_by ORDER BY a.created DESC LIMIT 200').all()).results:[];
  return {issues,leads,deals,orders:orders.map(o=>({id:o.id,order_number:o.order_number,deal_id:o.deal_id,lead_id:o.lead_id,commercial_id:o.commercial_id,logistics_id:o.logistics_id,archived:o.archived,version:o.version})),tasks,handovers,people,audit,calendar_years:[2026]};
 }
 if(method!=='POST')fail('操作不存在',404);
 if(path==='workflow/tasks/update'){
  const task:any=await db.prepare("SELECT t.*,o.version AS order_version,o.archived FROM crm_followup_tasks t JOIN crm_followup_orders o ON o.id=t.order_id WHERE t.id=? AND t.owner_id=? AND EXISTS(SELECT 1 FROM crm_workflow_handovers h WHERE h.kind='task' AND h.entity_id=t.id AND h.to_id=? AND h.state='已接收')").bind(body.id,user.id,user.id).first();
  if(!task||user.id!==actor.id)fail('只能更新本人已接收任务',403);if(task.archived||task.status!=='待处理')fail('任务或订单已结束');
  const next=required(body.next_action,'下一步'),reply=required(body.contact_reply,'联系回复');const status=body.status;if(!['待处理','已解决'].includes(status))fail('任务状态无效');
  const resolution=status==='已解决'?required(body.resolution,'完成依据'):clean(body.resolution),confirmation=clean(body.confirmation),notified=clean(body.notified);
  if(task.kind==='金额事项'&&status==='已解决'&&(!confirmation||!notified))fail('金额事项需留存告知商务及有权限人员确认记录');
  if(JSON.parse(task.meta||'{}').phase1)fail('请由跟单负责人在订单跟单记录中更新此事项，保留完整过程与金额确认');
  const nextDate=date(body.next_followup);if(status==='待处理'&&nextDate<chinaToday())fail('下次跟进日期不能早于今天');
  const token=id(),time=now();const result=await db.batch([db.prepare('UPDATE crm_followup_orders SET version=version+1,change_token=?,updated=?,updated_by=? WHERE id=? AND version=? AND archived=0 AND EXISTS(SELECT 1 FROM crm_followup_tasks WHERE id=? AND owner_id=? AND status=?)').bind(token,time,actor.id,task.order_id,body.order_version,task.id,actor.id,'待处理'),db.prepare('UPDATE crm_followup_tasks SET next_action=?,contact_reply=?,status=?,resolution=?,confirmation=?,notified=?,next_followup=?,updated=?,updated_by=? WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM crm_followup_orders WHERE id=? AND change_token=?)').bind(next,reply,status,resolution,confirmation,notified,nextDate+'T09:00:00.000Z',time,actor.id,task.id,actor.id,task.order_id,token),workflowAudit(db,actor,'接收人更新任务',task.id,{status,next_action:next,contact_reply:reply,resolution,confirmation,notified},true)]);if(!result[0].meta.changes)fail('订单已更新，请刷新后重试',409);return {ok:true};
 }
 if(path==='workflow/handovers/accept'){
  if(user.id!==actor.id)fail('请切回本人账号接收交接',403);
  const h:any=await db.prepare("SELECT * FROM crm_workflow_handovers WHERE id=? AND state='待接收' AND to_id=?").bind(body.id,actor.id).first();if(!h)fail('待接收交接不存在',404);
  if(user.role==='followup'&&(h.kind!=='logistics'||!can(user,'followup_edit')))fail('跟单员只能接收本人订单跟单交接',403);
  const {spec,row}=await handoverTarget(db,h.kind,h.entity_id);if(row[spec.field]!==h.from_id)fail('原负责人已变更，请管理员重新核查',409);
  const time=now();
  const condition=`EXISTS(SELECT 1 FROM crm_workflow_handovers WHERE id=? AND state='已接收' AND accepted=?)`;
  const result=await db.batch([
   db.prepare(`UPDATE crm_workflow_handovers SET state='已接收',accepted=? WHERE id=? AND state='待接收' AND to_id=? AND EXISTS(SELECT 1 FROM crm_users WHERE id=? AND active=1) AND EXISTS(SELECT 1 FROM ${spec.table} WHERE id=? AND ${spec.field}=?)`).bind(time,h.id,actor.id,actor.id,h.entity_id,h.from_id),
   db.prepare(`UPDATE ${spec.table} SET ${spec.field}=?${['commercial','logistics'].includes(h.kind)?',version=version+1,change_token=?,updated=?,updated_by=?':''} WHERE id=? AND ${spec.field}=? AND ${condition}`).bind(h.to_id,...(['commercial','logistics'].includes(h.kind)?[id(),time,actor.id]:[]),h.entity_id,h.from_id,h.id,time),
   ...(h.kind==='task'?[db.prepare(`UPDATE crm_followup_orders SET version=version+1,change_token=?,updated=?,updated_by=? WHERE id=? AND ${condition}`).bind(id(),time,actor.id,row.order_id,h.id,time)]:[]),
   workflowAudit(db,actor,'接收交接',h.entity_id,{handover:h.id,kind:h.kind,from:h.from_id,to:h.to_id},true)
  ]);if(!result[0].meta.changes)fail('交接已变化，请刷新',409);return {ok:true};
 }
 admin(user,actor);
 if(path==='workflow/handovers'){
  const {spec,row}=await handoverTarget(db,body.kind,body.entity_id),to:any=await db.prepare('SELECT * FROM crm_users WHERE id=? AND active=1').bind(body.to_id).first();if(!to||to.id===row[spec.field])fail('请选择不同的有效接收人');
  if(['customer','commercial'].includes(body.kind)&&to.role!=='sales')fail('客户和商务订单须交接给有效业务员');
  if(body.kind==='logistics'&&!can(to,'followup_edit')&&(to.role==='followup'||!await db.prepare('SELECT user_id FROM crm_followup_staff WHERE user_id=?').bind(to.id).first()))fail('后勤订单须交接给有跟单维护权限的人员');
  if(await db.prepare("SELECT id FROM crm_workflow_handovers WHERE kind=? AND entity_id=? AND state='待接收'").bind(body.kind,body.entity_id).first())fail('已有待接收交接，请先完成或撤销');
  const reason=required(body.reason,'交接原因'),key=id();await db.batch([db.prepare('INSERT INTO crm_workflow_handovers(id,kind,entity_id,from_id,to_id,reason,created,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(key,body.kind,body.entity_id,row[spec.field],to.id,reason,now(),actor.id),workflowAudit(db,actor,'指定交接',body.entity_id,{kind:body.kind,from:row[spec.field],to:to.id,reason})]);return {ok:true};
 }
 if(path==='workflow/handovers/cancel'){const reason=required(body.reason,'撤销交接原因');const result=await db.batch([db.prepare("UPDATE crm_workflow_handovers SET state='已撤销' WHERE id=? AND state='待接收'").bind(body.id),workflowAudit(db,actor,'撤销交接',body.id,{reason},true)]);if(!result[0].meta.changes)fail('待接收交接不存在',409);return {ok:true};}
 if(path==='workflow/contracts'){
  const deal=await dealAccess(db,user,body.deal_id);if(deal.cancelled)fail('成交已撤销');if(!['CNY','USD'].includes(body.currency))fail('请选择人民币或美元');
  const total=amount(body.total),schedule=body.schedule;if(!Array.isArray(schedule)||!schedule.length||schedule.length>24)fail('请填写1至24个付款节点');
  const rows=schedule.map((p:any)=>({title:required(p.title,'节点名称'),amount_minor:amount(p.amount),due_date:date(p.due_date),before_ship:p.before_ship===true}));
  if(rows.reduce((n:number,p:any)=>n+p.amount_minor,0)!==total)fail('付款节点合计必须等于合同总额');
  const old:any=await db.prepare('SELECT * FROM crm_workflow_contracts WHERE deal_id=?').bind(deal.id).first();if((old?.version||0)!==body.version)fail('应收资料已更新，请刷新',409);
  const reason=required(body.reason,'合同确认或变更依据');
  const result=await db.batch([db.prepare('INSERT INTO crm_workflow_contracts(deal_id,currency,total_minor,schedule,updated,updated_by) SELECT ?,?,?,?,?,? WHERE ?=0 ON CONFLICT(deal_id) DO NOTHING').bind(deal.id,body.currency,total,JSON.stringify(rows),now(),actor.id,body.version),...(old?[db.prepare('UPDATE crm_workflow_contracts SET currency=?,total_minor=?,schedule=?,version=version+1,updated=?,updated_by=? WHERE deal_id=? AND version=?').bind(body.currency,total,JSON.stringify(rows),now(),actor.id,deal.id,body.version)]:[]),workflowAudit(db,actor,'确认应收计划',deal.id,{before:old,after:{currency:body.currency,total_minor:total,schedule:rows},reason},true)]);if(!result[old?1:0].meta.changes)fail('应收资料已更新，请刷新',409);return {ok:true};
 }
 if(path==='workflow/refunds'){
  const receipt:any=await db.prepare('SELECT * FROM crm_receipts WHERE id=? AND cancelled=0').bind(body.receipt_id).first();if(!receipt)fail('有效收款不存在');
  const refunded=date(body.refunded_date);if(refunded>chinaToday()||refunded<receipt.received_date)fail('退款日期须在收款日期至今天之间');
  const key=id(),reason=required(body.reason,'退款原因'),minor=amount(body.amount),reference=required(body.reference,'唯一退款凭证号');
  if(await db.prepare('SELECT id FROM crm_workflow_refunds WHERE reference=?').bind(reference).first())fail('退款凭证号已登记');
  await db.batch([db.prepare('INSERT INTO crm_workflow_refunds(id,reference,receipt_id,amount_minor,refunded_date,reason,created,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(key,reference,receipt.id,minor,refunded,reason,now(),actor.id),workflowAudit(db,actor,'确认退款',receipt.deal_id,{id:key,reference,refunded_date:refunded,receipt_id:receipt.id,amount_minor:minor,currency:receipt.currency,reason})]);return {ok:true};
 }
 if(path==='workflow/link-order'){
  const deal=await dealAccess(db,user,body.deal_id);if(deal.cancelled)fail('成交已撤销');const order:any=await db.prepare('SELECT * FROM crm_followup_orders WHERE id=?').bind(body.order_id).first();if(!order||order.deal_id||order.lead_id!==deal.lead_id||order.order_number!==deal.order_number)fail('须选择同客户、同订单编号且尚未关联的跟单');
  const reason=required(body.reason,'关联核查依据');const result=await db.batch([db.prepare('UPDATE crm_followup_orders SET deal_id=?,version=version+1,change_token=?,updated=?,updated_by=? WHERE id=? AND version=? AND deal_id IS NULL').bind(deal.id,id(),now(),actor.id,order.id,body.version),workflowAudit(db,actor,'人工关联成交',order.id,{deal_id:deal.id,reason},true)]);if(!result[0].meta.changes)fail('订单已更新，请刷新',409);return {ok:true};
 }
 if(path==='workflow/releases'){
  if(await db.prepare('SELECT project_id FROM crm_contract_confirmations WHERE order_id=?').bind(body.order_id).first())fail('新流程订单须由销售确认付款或提交CEO审批');
  const order:any=await db.prepare('SELECT * FROM crm_followup_orders WHERE id=? AND archived=0').bind(body.order_id).first();if(!order?.deal_id)fail('请先核查并关联正式成交单');const deal=await dealAccess(db,user,order.deal_id);if(deal.cancelled)fail('成交已撤销');
  const payment=await paymentSummary(db,deal.id),c=payment.contract;if(!c)fail('合同金额与应收计划待核实，不能放行');if(body.version!==c.version)fail('收款或应收已变化，请刷新核对',409);
  const special=body.special===true,reason=required(body.reason,special?'特殊放行原因及依据':'发货核对依据');if(!special&&(payment.cross_currency||payment.net_minor<payment.ship_due_minor))fail('跨币种到账待核查或未满足发货前应收；须管理员填写特殊放行原因');
  const result=await db.batch([db.prepare('INSERT INTO crm_workflow_releases(order_id,deal_id,contract_version,special,reason,created,created_by) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_workflow_contracts WHERE deal_id=? AND version=?) ON CONFLICT(order_id) DO UPDATE SET deal_id=excluded.deal_id,contract_version=excluded.contract_version,special=excluded.special,reason=excluded.reason,created=excluded.created,created_by=excluded.created_by').bind(order.id,deal.id,c.version,special?1:0,reason,now(),actor.id,deal.id,c.version),workflowAudit(db,actor,special?'特殊发货放行':'发货放行',order.id,{deal_id:deal.id,version:c.version,net_minor:payment.net_minor,ship_due_minor:payment.ship_due_minor,currency:c.currency,reason},true)]);if(!result[0].meta.changes)fail('收款已变化，请重新核对',409);return {ok:true};
 }
 fail('操作不存在',404);
}
