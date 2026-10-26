import {AllocationError} from './allocation-server';
import {id,now,clean,can} from './crm';
import {followupOrder,followupManager,writeFollowup} from './order-followup-server';
import {RECORD_TYPES,chinaDay,upcomingNodes} from './followup-phase1';

const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
const required=(v:any,label:string,max=2000)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail('请填写'+label+'（最多'+max+'字）');return v.trim();};
const time=(v:any,label:string)=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,19)!==v.slice(0,19))fail('请填写有效的'+label);return new Date(v).toISOString();};
async function person(db:D1Database,v:any,label:string){if(typeof v!=='string'||!await db.prepare('SELECT id FROM crm_users WHERE id=? AND active=1').bind(v).first())fail('请选择有效的'+label);return v;}
function minor(v:any,label:string){if(!/^-?\d{1,10}(\.\d{1,2})?$/.test(String(v??'')))fail(label+'须为最多两位小数的金额');return Math.round(Number(v)*100);}
async function references(db:D1Database,row:any,input:any){
 if(!Array.isArray(input)||input.length>30)fail('最多关联30项资料');
 const refs=[];
 for(const ref of input){
  if(ref?.type==='file'){
   const file:any=await db.prepare('SELECT id,name FROM crm_followup_files WHERE id=? AND order_id=?').bind(clean(ref.id,100),row.id).first();
   if(!file)fail('关联附件不存在或不属于此订单');refs.push({type:'file',id:file.id,label:file.name,url:'/api/followup/files/'+file.id});
  }else if(ref?.type==='link'){
   const url=required(ref.url,'资料链接',2000),label=required(ref.label,'资料名称',200);
   let parsed:URL;try{parsed=new URL(url);}catch{fail('请填写完整的 HTTPS 资料链接');}
   if(parsed!.protocol!=='https:'||parsed!.username||parsed!.password)fail('资料链接须使用 HTTPS 且不含登录信息');refs.push({type:'link',label,url});
  }else fail('资料关联类型无效');
 }
 return refs;
}
export async function phase1Endpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 if(!path.startsWith('followup-phase1/'))return undefined;
 if(method!=='GET'&&(!body||typeof body!=='object'||Array.isArray(body)))fail('跟单请求格式无效');
 const manager=await followupManager(db,user),all=manager||can(user,'followup_all');
 if(!all&&user.role!=='sales')fail('没有跟单访问权限',403);
 if(path==='followup-phase1/report'&&method==='GET'){
  const day=chinaDay(now()),args=all?[]:[user.id],where=all?'':' WHERE o.commercial_id=?';
  const orders=(await db.prepare('SELECT o.* FROM crm_followup_orders o'+where).bind(...args).all<any>()).results;
  const records=(await db.prepare('SELECT r.*,u.name AS actor_name FROM crm_followup_records r JOIN crm_followup_orders o ON o.id=r.order_id JOIN crm_users u ON u.id=r.created_by'+where+' ORDER BY r.occurred_at DESC,r.created DESC,r.rowid DESC').bind(...args).all<any>()).results.map(r=>({...r,payload:JSON.parse(r.payload)}));
  const checks=(await db.prepare('SELECT c.*,u.name AS actor_name FROM crm_followup_checks c JOIN crm_followup_orders o ON o.id=c.order_id JOIN crm_users u ON u.id=c.created_by'+where+' ORDER BY c.created DESC,c.rowid DESC').bind(...args).all<any>()).results;
  const changes=(await db.prepare("SELECT e.*,u.name AS actor_name FROM crm_followup_events e JOIN crm_followup_orders o ON o.id=e.order_id JOIN crm_users u ON u.id=e.created_by"+where+" ORDER BY e.created DESC,e.rowid DESC").bind(...args).all<any>()).results.filter(e=>chinaDay(e.created)===day&&e.kind!=='每日核对').map(e=>({...e,payload:JSON.parse(e.payload)}));
  return {day,projects:orders.map(o=>{const check=checks.find(c=>c.order_id===o.id&&c.day===day);return {order_id:o.id,checked:check?.order_version===o.version,check:check||null,latest:records.find(r=>r.order_id===o.id)||null,progress:records.filter(r=>r.order_id===o.id&&(chinaDay(r.occurred_at)===day||chinaDay(r.created)===day)),changes:changes.filter(e=>e.order_id===o.id),nodes:upcomingNodes({...o,details:JSON.parse(o.details)},day)};})};
 }
 const match=/^followup-phase1\/orders\/([a-z0-9-]+)\/(records|check|delegate)$/.exec(path);if(!match)fail('跟单操作不存在',404);
 const {row}=await followupOrder(db,user,match![1]);
 if(method==='GET'&&match![2]==='records')return {records:(await db.prepare('SELECT r.*,u.name AS actor_name FROM crm_followup_records r JOIN crm_users u ON u.id=r.created_by WHERE r.order_id=? ORDER BY r.occurred_at DESC,r.created DESC,r.rowid DESC').bind(row.id).all<any>()).results.map(r=>({...r,payload:JSON.parse(r.payload)}))};
 if(!manager)fail('只有管理员及指定后勤可以维护跟单',403);
 if(method!=='POST')fail('请求方式无效',405);
 if(row.archived)fail('订单已归档，请先重新打开',409);
 if(match![2]==='check'){
  const note=clean(body.note,2000),day=chinaDay(now());
  return writeFollowup(db,row,body,actor,'每日核对',{day,note},(token,at)=>[db.prepare('INSERT INTO crm_followup_checks(id,order_id,day,order_version,note,created,created_by) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_followup_orders WHERE id=? AND change_token=?)').bind(id(),row.id,day,row.version+1,note,at,actor.id,row.id,token)]);
 }
 if(match![2]==='delegate'){
  const delegate=body.delegate_id?await person(db,body.delegate_id,'代办人'):'';
  if(delegate){const u:any=await db.prepare('SELECT id,role,permissions FROM crm_users WHERE id=?').bind(delegate).first();if(!await followupManager(db,u))fail('代办人须有跟单维护权限');}
  const reason=required(body.reason,'代办安排说明'),details={...row.details,delegate_id:delegate};
  return writeFollowup(db,row,body,actor,'更新紧急代办',{before:row.details.delegate_id||'',after:delegate,reason},()=>[],{...row,details});
 }
 const category=RECORD_TYPES.find(c=>c.key===body.category);if(!category)fail('请选择跟单环节');
 const occurred=time(body.occurred_at,'事项发生时间');if(Date.parse(occurred)>Date.now()+60000)fail('事项发生时间不能在未来；计划时间请填写到下一步');
 const title=required(body.title,'跟进事项',300),contact=required(body.contact_reply,'对接人员／部门及对方回复'),content=required(body.content,'本次跟进内容'),result=required(body.result,'当前结果或问题');
 if(!['待处理','已解决'].includes(body.status)||!['普通','重大','紧急'].includes(body.priority))fail('请选择处理状态及重要程度');
 const open=body.status==='待处理';
 const next=open?required(body.next_action,'下一步'):clean(body.next_action,2000),owner=open?await person(db,body.owner_id,'责任人'):row.logistics_id,due=open?time(body.due_at,'预计完成时间'):'',follow=open?time(body.next_followup,'约定跟进时间'):'';
 const fields:Record<string,string>={};for(const [key,label] of category!.fields)fields[key]=clean(body.fields?.[key],2000);
 if(category!.key==='inspection')for(const key of ['inspector','date','requirements','result'])required(fields[key],category!.fields.find(f=>f[0]===key)![1]);
 if(category!.key==='rectification'){for(const key of ['defects','responsible','deadline'])required(fields[key],category!.fields.find(f=>f[0]===key)![1]);if(!open)required(fields.reinspection,'复验确认');}
 const refs=await references(db,row,body.references||[]);
 const previous:any=body.task_id?await db.prepare('SELECT * FROM crm_followup_tasks WHERE id=? AND order_id=?').bind(body.task_id,row.id).first():null;
 if(body.task_id&&!previous)fail('所关联事项不存在',404);
 const previousMoney=previous?JSON.parse(previous.meta||'{}').money:null;
 let money:any=null;
 if(body.money){
  const m=body.money;const amount=minor(m.amount,'金额'),difference=minor(m.difference,'差额');if(amount<0)fail('金额不能为负数');
  const currency=required(m.currency,'币种',3).toUpperCase();if(!/^[A-Z]{3}$/.test(currency))fail('币种须为三位代码，如 CNY 或 USD');
  if(!['待确认','已确认'].includes(m.state))fail('请选择商务确认状态');
  money={reason:required(m.reason,'金额原因'),amount_minor:amount,difference_minor:difference,currency,state:m.state,confirmed_by:'',evidence:clean(m.evidence,2000)};
  if(m.state==='已确认'){
   money.confirmed_by=await person(db,m.confirmed_by,'金额确认人');if(!money.evidence)fail('请填写金额确认凭证');
   const confirmer:any=await db.prepare('SELECT role FROM crm_users WHERE id=?').bind(money.confirmed_by).first();if(money.confirmed_by!==row.commercial_id&&!['admin','ceo','management'].includes(confirmer.role))fail('金额确认人须为本订单商务或管理者');
  }
  if(!open&&m.state!=='已确认')fail('金额未确认，不能标记为已解决');
 }else if(previousMoney||previous?.kind==='金额事项')fail('金额事项须保留金额、币种及确认状态');
 if(money?.confirmed_by){const u:any=await db.prepare('SELECT name FROM crm_users WHERE id=?').bind(money.confirmed_by).first();money.confirmer_name=u.name;}
 const ownerUser:any=await db.prepare('SELECT name FROM crm_users WHERE id=?').bind(owner).first();
 const taskId=previous?.id||(open?id():null),recordId=id(),payload={title,contact_reply:contact,content,result,status:body.status,priority:body.priority,next_action:next,owner_id:owner,owner_name:ownerUser?.name||'',due_at:due,next_followup:follow,fields,references:refs,money};
 const kind=money?'金额事项':body.priority==='普通'?'待办':'异常';
 return writeFollowup(db,row,body,actor,'跟单过程记录',{record_id:recordId,category:category!.name,title,result,task_id:taskId},(token,at)=>[
  ...(taskId?[db.prepare('INSERT INTO crm_followup_tasks(id,order_id,kind,step,title,impact,contact_reply,next_action,owner_id,due_at,next_followup,status,resolution,confirmation,notified,meta,created,created_by,updated,updated_by) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_followup_orders WHERE id=? AND change_token=?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,step=excluded.step,title=excluded.title,impact=excluded.impact,contact_reply=excluded.contact_reply,next_action=excluded.next_action,owner_id=excluded.owner_id,due_at=excluded.due_at,next_followup=excluded.next_followup,status=excluded.status,resolution=excluded.resolution,confirmation=excluded.confirmation,meta=excluded.meta,updated=excluded.updated,updated_by=excluded.updated_by').bind(taskId,row.id,kind,category!.step,title,content+'\n'+result,contact,next,open?owner:previous?.owner_id||owner,due||previous?.due_at||'',follow||previous?.next_followup||'',body.status,open?'':result,money?.state==='已确认'?money.evidence:'',previous?.notified||'',JSON.stringify({phase1:true,record_id:recordId,category:category!.key,priority:body.priority,money}),previous?.created||at,previous?.created_by||actor.id,at,actor.id,row.id,token)]:[]),
  db.prepare('INSERT INTO crm_followup_records(id,order_id,category,occurred_at,payload,task_id,created,created_by) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_followup_orders WHERE id=? AND change_token=?)').bind(recordId,row.id,category!.key,occurred,JSON.stringify(payload),taskId,at,actor.id,row.id,token)
 ]);
}
