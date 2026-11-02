import {AllocationError} from './allocation-server';
import {now} from './crm';
import {FOLLOWUP_NODES,processSummary} from './followup-board';
import {followupManager,followupOrder,writeFollowup} from './order-followup-server';

function fail(message:string,status=400):never{throw new AllocationError(message,status);}
function date(value:unknown){
 if(value==='')return '';
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('请填写有效日期');
 return value;
}
async function owners(db:D1Database,user:any,row:any){
 const users=(await db.prepare('SELECT id,name,role,permissions FROM crm_users WHERE active=1'+(user.role==='followup'?' AND id IN (?,?)':'')+' ORDER BY name').bind(...(user.role==='followup'?[row.logistics_id,row.commercial_id]:[])).all<any>()).results;
 const allowed=[];for(const account of users){try{await followupOrder(db,account,row.id);allowed.push({id:account.id,name:account.name});}catch(e){if(!(e instanceof AllocationError)||![403,404].includes(e.status))throw e;}}
 return allowed;
}
export async function followupScheduleEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 const match=/^followup\/orders\/([^/]+)\/(schedule|progress)$/.exec(path);if(!match)return undefined;
 const {row,manager}=await followupOrder(db,user,match[1]);
 if(!manager||user.role==='ceo'||actor.id!==user.id)fail('没有本订单的跟单维护权限',403);
 if(method==='GET'&&match[2]==='schedule')return {order:row,owners:await owners(db,user,row)};
 if(method!=='POST')fail('此操作仅支持保存',405);
 if(!body||typeof body!=='object'||Array.isArray(body))fail('排期请求格式无效');
 if(row.archived)fail('已归档订单不可修改',409);
 const before=row.details.business_process||{},after={...before},at=now();
 if(match[2]==='schedule'){
  if(!Array.isArray(body.nodes)||body.nodes.length!==FOLLOWUP_NODES.length||new Set(body.nodes.map((n:any)=>n?.page)).size!==FOLLOWUP_NODES.length)fail('请提交完整的七个环节排期');
  const all=await followupManager(db,user),eligible=new Set((await owners(db,user,row)).map(p=>p.id));
  for(const input of body.nodes){
   const node=FOLLOWUP_NODES.find(n=>n.page===input?.page);if(!node)fail('环节无效');
   const start=date(input.start),due=date(input.due);
   if(!!start!==!!due)fail(node.label+'：请同时填写开始与完成日期，或都留空');
   if(start&&due<start)fail(node.label+'：完成日期不能早于开始日期');
   const owner=input.owner_id;
   if(typeof owner!=='string'||!await db.prepare('SELECT id FROM crm_users WHERE id=? AND active=1').bind(owner).first())fail('请选择有效负责人');
   if(!all&&![row.logistics_id,row.commercial_id].includes(owner))fail('只能指定本订单的商务或跟单负责人',403);
   if(!eligible.has(owner))fail('该负责人无权查看本订单，请选择本单负责人或有查看权限的管理人员',403);
   const previous=before[node.page]||{};
   after[node.page]={...previous,start,due,owner_id:owner,schedule_only:previous.schedule_only??!(previous.at||previous.status||previous.next||Object.keys(previous.values||{}).length),original_start:previous.original_start||previous.start||start,original_due:previous.original_due||previous.due||due,confirmed_at:Object.hasOwn(previous,'confirmed_at')?previous.confirmed_at:previous.at||'',scheduled_at:at,scheduled_by:actor.id};
  }
  return writeFollowup(db,row,body,actor,'更新项目排期',{before,after},()=>[],{...row,details:{...row.details,business_process:after}});
 }
 const node=FOLLOWUP_NODES.find(n=>n.page===body.page);if(!node)fail('请选择有效环节');
 const previous=before[node.page]||{},summary=processSummary(row,node);
 if(['已完成','不适用'].includes(summary.status))fail('此环节已经完成，请查看或编辑原核对记录');
 if(!['normal','problem'].includes(body.action))fail('请选择正常推进或发生异常');
 const note=typeof body.note==='string'?body.note.trim():'';
 if(note.length>2000)fail('更新说明不能超过2000字');
 if((body.action==='problem'||previous.problem)&&!note)fail(previous.problem?'请填写异常核实结果，或继续登记异常':'请填写异常原因及下一步');
 const expected=body.action==='problem'?date(body.expected):previous.expected||'';
 if(body.action==='problem'&&!expected)fail('请填写预计解决日期');
 if(expected&&previous.start&&expected<previous.start)fail('预计解决日期不能早于计划开始日期');
 after[node.page]={...previous,schedule_only:false,status:body.action==='problem'?'待确认':'进行中',problem:body.action==='problem'?note:'',expected,confirmed_at:at,at,by:actor.id,...(note?{next:note}:{})};
 return writeFollowup(db,row,body,actor,'更新'+node.page,{page:node.page,quick:body.action,before:previous,after:after[node.page]},()=>[],{...row,details:{...row.details,business_process:after}});
}
