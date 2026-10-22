import {importOrders} from './order-import-server';
import {AllocationError} from './allocation-server';
import {id,now,clean} from './crm';
import {ORDER_STEPS,ORDER_FIELDS,LOGISTICS_FIELDS,ORDER_DATES,blankSteps} from './order-followup';
export async function followupManager(db:D1Database,user:any){return user.role==='admin'||!!await db.prepare('SELECT user_id FROM crm_followup_staff WHERE user_id=?').bind(user.id).first();}
export async function followupOrder(db:D1Database,user:any,orderId:string){
 const manager=await followupManager(db,user);
 const row:any=await db.prepare('SELECT * FROM crm_followup_orders WHERE id=?').bind(orderId).first();
 if(!row||(!manager&&row.commercial_id!==user.id))throw new AllocationError('订单不存在或无权查看',404);
 return {row:{...row,details:JSON.parse(row.details),steps:JSON.parse(row.steps)},manager};
}
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
function date(value:any){if(value==='')return '';if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('请填写有效日期');return value;}
function dateTime(value:any){if(value==='')return '';if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))fail('请填写有效的时间');return new Date(value).toISOString();}
function required(value:any,label:string,max=2000){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('请填写'+label+'（不超过'+max+'字）');return value.trim();}
function stage(value:any){if(!Number.isInteger(value)||value<0||value>=ORDER_STEPS.length)fail('请选择有效阶段');return value;}
async function person(db:D1Database,value:any,label:string){if(typeof value!=='string'||!await db.prepare('SELECT id FROM crm_users WHERE id=? AND active=1').bind(value).first())fail('请选择有效的'+label);return value;}
function event(db:D1Database,orderId:string,token:string,actor:any,kind:string,payload:any,time:string){return db.prepare('INSERT INTO crm_followup_events(id,order_id,kind,payload,created,created_by) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_followup_orders WHERE id=? AND change_token=?)').bind(id(),orderId,kind,JSON.stringify(payload),time,actor.id,orderId,token);}
export async function writeFollowup(db:D1Database,row:any,body:any,actor:any,kind:string,payload:any,extra:(token:string,time:string)=>D1PreparedStatement[],fields?:{details:any;steps:any;stage:number;archived:number;logistics_id:string}){
 if(!Number.isInteger(body.version)||body.version!==row.version)fail('此订单已更新，请刷新后重新填写',409);
 const token=id(),time=now(),f=fields||row;
 const result=await db.batch([db.prepare('UPDATE crm_followup_orders SET logistics_id=?,details=?,steps=?,stage=?,archived=?,version=version+1,change_token=?,updated=?,updated_by=? WHERE id=? AND version=? AND change_token=?').bind(f.logistics_id,JSON.stringify(f.details),JSON.stringify(f.steps),f.stage,f.archived,token,time,actor.id,row.id,body.version,row.change_token),...extra(token,time),event(db,row.id,token,actor,kind,payload,time)]);
 if(!result[0].meta.changes)fail('此订单已更新，请刷新后重试',409);
 return {ok:true,id:row.id};
}
export async function followupEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 if(!path.startsWith('followup'))return undefined;
 // Customer communication follow-ups use the original /followup POST handler.
 if(path==='followup'&&method==='POST'&&typeof body?.id==='string'&&!Object.hasOwn(body,'project'))return undefined;
 if(method!=='GET'&&(!body||typeof body!=='object'||Array.isArray(body)))fail('跟单请求格式无效');
 const manager=await followupManager(db,user);
 if(!manager&&user.role!=='sales')fail('此账号没有跟单访问权限，请联系管理员',403);
 if(path==='followup'&&method==='GET'){
  const where=manager?'':' WHERE o.commercial_id=?',args=manager?[]:[user.id];
  const orders=(await db.prepare('SELECT o.*,l.name AS customer_name,c.name AS commercial_name,s.name AS logistics_name FROM crm_followup_orders o JOIN crm_leads l ON l.id=o.lead_id JOIN crm_users c ON c.id=o.commercial_id JOIN crm_users s ON s.id=o.logistics_id'+where+' ORDER BY o.archived,o.updated DESC').bind(...args).all()).results.map((o:any)=>({...o,details:JSON.parse(o.details),steps:JSON.parse(o.steps)}));
  const tasks=(await db.prepare('SELECT t.*,u.name AS owner_name FROM crm_followup_tasks t JOIN crm_followup_orders o ON o.id=t.order_id JOIN crm_users u ON u.id=t.owner_id'+where+' ORDER BY t.due_at,t.created').bind(...args).all()).results;
  const people=manager?(await db.prepare('SELECT id,name,role FROM crm_users WHERE active=1 ORDER BY name').all()).results:[];
  const staff=user.role==='admin'?(await db.prepare('SELECT user_id FROM crm_followup_staff').all()).results.map((s:any)=>s.user_id):[];
  const deals=manager?(await db.prepare('SELECT d.id,d.order_number,d.lead_id,d.owner_id,l.name AS customer_name FROM crm_deals d JOIN crm_leads l ON l.id=d.lead_id WHERE d.cancelled=0 AND NOT EXISTS(SELECT 1 FROM crm_followup_orders o WHERE o.deal_id=d.id) ORDER BY d.created DESC').all()).results:[];
  const leads=manager?(await db.prepare('SELECT id,name,owner_id FROM crm_leads WHERE owner_id IS NOT NULL ORDER BY name').all()).results:[];
  const logistics=manager?(await db.prepare("SELECT u.id,u.name FROM crm_users u WHERE u.active=1 AND (u.role='admin' OR EXISTS(SELECT 1 FROM crm_followup_staff s WHERE s.user_id=u.id)) ORDER BY u.name").all()).results:[];
  return {orders,tasks,people,staff,deals,leads,logistics,can_manage:manager,is_admin:user.role==='admin',timezone:'Asia/Shanghai'};
 }
 if(path==='followup/import'&&method==='POST'){
  if(!manager)fail('只有管理员及指定后勤可以导入跟单',403);
  return importOrders(db,user,actor,body);
 }
 if(path==='followup/staff'&&method==='POST'){
  if(user.role!=='admin'||actor.role!=='admin')fail('只有管理员可以指定后勤账号',403);
  await person(db,body.user_id,'后勤账号');
  if(typeof body.enabled!=='boolean')fail('账号授权状态无效');
  if(body.enabled)await db.prepare('INSERT OR IGNORE INTO crm_followup_staff(user_id,created,created_by) VALUES(?,?,?)').bind(body.user_id,now(),actor.id).run();
  else await db.prepare('DELETE FROM crm_followup_staff WHERE user_id=?').bind(body.user_id).run();
  return {ok:true};
 }
 if(path==='followup'&&method==='POST'){
  if(!manager)fail('只有管理员及指定后勤账号可以创建跟单',403);
  const project=required(body.project,'项目名称',200),number=required(body.order_number,'合同／订单编号',100);
  const lead:any=await db.prepare('SELECT id,owner_id FROM crm_leads WHERE id=?').bind(body.lead_id).first();if(!lead||!lead.owner_id)fail('请选择已分配业务员的CRM客户');
  const commercial=await person(db,lead.owner_id,'商务负责人'),logistics=await person(db,body.logistics_id,'后勤负责人');
  const logisticsUser:any=await db.prepare('SELECT id,role FROM crm_users WHERE id=?').bind(logistics).first();if(!await followupManager(db,logisticsUser))fail('后勤负责人需为管理员或指定后勤账号');
  let dealId=null;
  if(body.deal_id){const d:any=await db.prepare('SELECT * FROM crm_deals WHERE id=? AND cancelled=0').bind(body.deal_id).first();if(!d||d.lead_id!==lead.id||d.order_number!==number||d.owner_id!==commercial)fail('成交订单、客户、商务或编号不一致');dealId=d.id;}
  if(await db.prepare('SELECT id FROM crm_followup_orders WHERE order_number=?').bind(number).first())fail('此订单已经建立跟单，请打开已有记录');
  const orderId=id(),time=now(),token=id(),details={dates:{}},steps=blankSteps();
  try{await db.batch([db.prepare('INSERT INTO crm_followup_orders(id,order_number,project,lead_id,deal_id,commercial_id,logistics_id,details,steps,change_token,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(orderId,number,project,lead.id,dealId,commercial,logistics,JSON.stringify(details),JSON.stringify(steps),token,time,actor.id,time,actor.id),event(db,orderId,token,actor,'建立跟单',{project,order_number:number,lead_id:lead.id,deal_id:dealId},time)]);}catch(e:any){if(String(e.message).includes('UNIQUE'))fail('此订单已经建立跟单');throw e;}
  return {ok:true,id:orderId};
 }
 const match=/^followup\/orders\/([a-z0-9-]+)(?:\/(tasks|steps|details|archive|reopen))?$/.exec(path);if(!match)return fail('跟单操作不存在',404);
 const {row,manager:canManage}=await followupOrder(db,user,match[1]);
 if(method==='GET'&&!match[2]){
  const events=(await db.prepare('SELECT e.*,u.name AS actor_name FROM crm_followup_events e JOIN crm_users u ON u.id=e.created_by WHERE order_id=? ORDER BY e.created DESC,e.rowid DESC').bind(row.id).all()).results.map((e:any)=>({...e,payload:JSON.parse(e.payload)}));
  const files=(await db.prepare('SELECT id,step,name,size,created FROM crm_followup_files WHERE order_id=? ORDER BY created DESC').bind(row.id).all()).results;
  return {order:row,events,files};
 }
 if(!canManage)fail('业务员仅可查看本人订单，不能修改跟单',403);
 if(method!=='POST')fail('此跟单操作不支持该请求',405);
 const action=match[2];
 if(row.archived&&action!=='reopen')fail('订单已归档，请先重新打开',409);
 if(action==='details'){
  const details:any={dates:{},history_note:row.details.history_note||''},input=body.details;
  if(!input||typeof input!=='object'||!input.dates||typeof input.dates!=='object')fail('资料格式无效');
  for(const [key] of [...ORDER_FIELDS,...LOGISTICS_FIELDS]){if(input[key]!==undefined&&typeof input[key]!=='string')fail('资料内容须为文字');details[key]=clean(input[key],2000);}
  const logistics=await person(db,body.logistics_id||row.logistics_id,'后勤负责人');
  const assigned:any=await db.prepare('SELECT id,role FROM crm_users WHERE id=?').bind(logistics).first();if(!await followupManager(db,assigned))fail('后勤负责人需为管理员或指定后勤账号');
  const changes:any[]=[];
  for(const [key,label] of ORDER_DATES){
   const item=input.dates[key]||{},value=date(item.date||''),previous=row.details.dates?.[key];
   if(value){if(!['预计','已确认','实际'].includes(item.kind)||key==='actual_ship'&&item.kind!=='实际'||key.startsWith('eta_')&&item.kind==='实际')fail('请区分预计、已确认及实际时间');const source=required(item.source,label+'信息来源',200);const confirmed_at=dateTime(item.confirmed_at||'');if(!confirmed_at&&!(previous?.imported&&previous.date===value&&previous.kind===item.kind&&previous.source===source))fail('请填写'+label+'信息确认时间');const sync_record=clean(item.sync_record,1000);details.dates[key]={date:value,kind:item.kind,source,confirmed_at,updated_at:previous?.date===value?previous.updated_at||now():now(),sync_record:previous?.date&&previous.date!==value&&sync_record===previous.sync_record?'':sync_record,...(!confirmed_at&&previous?.imported?{imported:true}:{})};}
   if(previous?.date&&previous.date!==value){const reason=required(body.change_reason,'日期变更原因',1000);changes.push({field:label,before:previous,after:details.dates[key]||null,reason});}
  }
  return writeFollowup(db,row,body,actor,'更新订单资料',{before:row.details,after:details,date_changes:changes,logistics_id:logistics},()=>[],{...row,details,logistics_id:logistics});
 }
 if(action==='steps'){
  const index=stage(body.step),status=body.status;
  if(!['待处理','进行中','已完成','不适用'].includes(status))fail('阶段状态无效');
  const note=clean(body.note,2000),checks=body.checks;
  if(!Array.isArray(checks)||new Set(checks).size!==checks.length||checks.some((n:any)=>!Number.isInteger(n)||n<0||n>=ORDER_STEPS[index].checks.length))fail('核对清单无效');
  if(['已完成','不适用'].includes(status)&&!note)fail('请填写完成依据或不适用原因');
  if(status==='已完成'&&checks.length!==ORDER_STEPS[index].checks.length)fail('请逐项完成核对清单');
  if(status==='不适用'&&[0,4,5,6,7,8,10,11].includes(index))fail('该关键阶段不能设为不适用');
  const tasks=(await db.prepare("SELECT id FROM crm_followup_tasks WHERE order_id=? AND status='待处理' AND step=?").bind(row.id,index).all()).results;
  if(['已完成','不适用'].includes(status)&&tasks.length)fail('此阶段仍有未解决事项，不能标记完成');
  if(index===11&&status==='已完成')fail('请通过订单归档操作完成最后阶段');
  if(index===4&&status==='已完成'&&(!row.details.dates?.planned_ship?.date||!row.details.forwarder_mode||row.details.forwarder_mode.includes('待确认')||!row.details.forwarder_contact))fail('请先记录计划发货日期、已确认的货代安排和联系人');
  if(index===5&&status==='已完成'&&!row.details.release_confirmation)fail('请先留存商务、财务付款及发货确认记录');
  if(index===6&&status==='已完成'&&(!row.details.dates?.actual_ship?.date||!row.details.bill_no&&!row.details.container_no))fail('请先记录实际发货日期及适用运输编号');
  if(index===7&&status==='已完成'&&!row.details.dates?.eta_port?.date)fail('请先记录预计到港日期');
  const steps=[...row.steps];steps[index]={status,checks,note,by:actor.name||actor.id,at:now(),for_date:index===4?row.details.dates?.planned_ship?.date||'':index===7?row.details.dates?.eta_port?.date||'':''};
  const current=stage(body.current_stage);
  return writeFollowup(db,row,body,actor,'更新阶段',{step:index,before:row.steps[index],after:steps[index],current_stage:current},()=>[],{...row,steps,stage:current});
 }
 if(action==='tasks'){
  const kind=body.kind;if(!['待办','异常','客户消息','金额事项'].includes(kind))fail('请选择事项类型');
  const index=stage(body.step),title=required(body.title,'问题／事项',300),impact=required(body.impact,'影响或处理背景'),contact=required(body.contact_reply,'已联系部门、负责人及回复'),next=required(body.next_action,'下一步处理办法'),owner=await person(db,body.owner_id,'处理负责人'),due=dateTime(body.due_at||''),follow=dateTime(body.next_followup||'');if(!due||!follow)fail('请填写完成时间及下次跟进时间');
  if(!['待处理','已解决'].includes(body.status))fail('事项状态无效');
  const resolution=clean(body.resolution,2000),confirmation=clean(body.confirmation,2000),notified=clean(body.notified,2000);
  if(body.status==='已解决'&&!resolution)fail('解决事项前必须核实结果并填写完成依据');
  if(kind==='金额事项'&&body.status==='已解决'&&(!notified||!confirmation))fail('金额事项需留存提前告知商务及有权限人员确认记录');
  const taskId=body.id||id(),previous:any=body.id?await db.prepare('SELECT * FROM crm_followup_tasks WHERE id=? AND order_id=?').bind(body.id,row.id).first():null;if(body.id&&!previous)fail('事项不存在',404);
  return writeFollowup(db,row,body,actor,previous?'更新事项':'新增事项',{before:previous,after:{id:taskId,kind,step:index,title,impact,contact_reply:contact,next_action:next,owner_id:owner,due_at:due,next_followup:follow,status:body.status,resolution,confirmation,notified}},(token,time)=>[
   db.prepare('INSERT INTO crm_followup_tasks(id,order_id,kind,step,title,impact,contact_reply,next_action,owner_id,due_at,next_followup,status,resolution,confirmation,notified,created,created_by,updated,updated_by) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_followup_orders WHERE id=? AND change_token=?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,step=excluded.step,title=excluded.title,impact=excluded.impact,contact_reply=excluded.contact_reply,next_action=excluded.next_action,owner_id=excluded.owner_id,due_at=excluded.due_at,next_followup=excluded.next_followup,status=excluded.status,resolution=excluded.resolution,confirmation=excluded.confirmation,notified=excluded.notified,updated=excluded.updated,updated_by=excluded.updated_by').bind(taskId,row.id,kind,index,title,impact,contact,next,owner,due,follow,body.status,resolution,confirmation,notified,previous?.created||time,previous?.created_by||actor.id,time,actor.id,row.id,token)
  ]);
 }
 if(action==='archive'){
  const tasks:any=await db.prepare("SELECT COUNT(*) AS n FROM crm_followup_tasks WHERE order_id=? AND status='待处理'").bind(row.id).first();if(tasks.n)fail('仍有未解决待办或异常，不能归档');
  if(row.steps.slice(0,11).some((s:any)=>!['已完成','不适用'].includes(s.status)))fail('请先完成各阶段，或为适用阶段填写不适用原因');
  const freight=row.steps[4],arrival=row.steps[7];if(freight.for_date!==row.details.dates?.planned_ship?.date||arrival.for_date!==row.details.dates?.eta_port?.date)fail('物流日期有变更，请重新核对货代及到达前跟进阶段');
  if(!row.details.acceptance)fail('请先记录交付验收情况');
  if(!Array.isArray(body.checks)||body.checks.length!==4||new Set(body.checks).size!==4||body.checks.some((n:any)=>!Number.isInteger(n)||n<0||n>3))fail('请逐项核对归档清单');
  const note=required(body.note,'归档依据'),steps=[...row.steps];steps[11]={status:'已完成',checks:body.checks,note,by:actor.name||actor.id,at:now(),for_date:''};
  return writeFollowup(db,row,body,actor,'订单归档',{note},()=>[],{...row,steps,stage:11,archived:1});
 }
 if(action==='reopen'){
  if(!row.archived)fail('订单尚未归档');const reason=required(body.reason,'重新打开原因'),steps=[...row.steps];steps[11]={...steps[11],status:'待处理'};
  return writeFollowup(db,row,body,actor,'重新打开订单',{reason},()=>[],{...row,steps,archived:0});
 }
 fail('跟单操作不存在',404);
}
