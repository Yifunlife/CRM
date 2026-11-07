import {AllocationError} from './allocation-server';
import {id,now} from './crm';
import {writeFollowup} from './order-followup-server';
import {shippingRelease} from './order-execution-server';
import {BATCH_PHASES,shipmentBatches,type BatchPhase,type BatchPlan,type ShipmentBatch} from './followup-batches';
const fail=(s:string,status=400):never=>{throw new AllocationError(s,status);};
const text=(v:any,label:string,required=false,max=2000)=>typeof v==='string'&&v.trim().length<=max&&(!required||v.trim())?v.trim():fail('请填写有效的'+label);
function date(v:any){if(v==='')return '';if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail('请填写有效日期');return v;}
export async function saveShipmentBatch(db:D1Database,row:any,actor:any,body:any,owners:{id:string}[]){
 const before=shipmentBatches(row),at=now(),today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 if(!['create','phase'].includes(body.action))fail('请选择新增批次或更新批次环节');
 if(!Number.isInteger(body.version)||body.version!==row.version)fail('此订单已更新，请刷新后重新填写',409);
 let previous:ShipmentBatch|undefined,after:ShipmentBatch;
 if(body.action==='create'){
  if(before.length>=50)fail('本订单已有50个批次，请先核对现有批次');
  if(!before.length&&(row.details.execution?.stages?.shipping?.status==='已完成'||row.details.business_process?.['出货交付']?.status==='已完成'))fail('整单已有完成发货记录，请先核对原记录，不能直接改为分批发货',409);
  const owner=body.owner_id;if(!owners.some(p=>p.id===owner))fail('请选择有权查看本订单的负责人',403);
  const start=date(body.start??''),due=date(body.due??'');if(!!start!==!!due||start&&due<start)fail('请成对填写有效的计划开始与完成日期');
  const blank=():BatchPlan=>({start:'',due:'',owner_id:owner,status:'未开始',completed:'',next:'',evidence:''});
  after={id:id(),name:text(body.name,'批次名称',true,100),goods:text(body.goods,'本批货物及数量',true),container_no:'',bill_no:'',inspection:'',phases:{production:{...blank(),start,due},loading:blank(),shipping:blank()},created:at,created_by:actor.id};
  if(before.some(b=>b.name===after.name))fail('批次名称已存在，请使用不同名称');
 }else{
  previous=before.find(b=>b.id===body.batch_id);if(!previous)return fail('出货批次不存在',404);
  const key=body.phase as BatchPhase;if(!BATCH_PHASES.some(p=>p.key===key))fail('请选择生产、装柜或发货环节');
  const input=body.plan;if(!input||typeof input!=='object'||Array.isArray(input))fail('批次环节内容无效');
  const old=previous.phases[key],start=date(input.start??old.start),due=date(input.due??old.due),completed=date(input.completed??old.completed);
  if(!!start!==!!due||start&&due<start)fail('请成对填写有效的计划开始与完成日期');
  if(!['未开始','进行中','待确认','已完成'].includes(input.status))fail('请选择有效环节状态');
  if(!owners.some(p=>p.id===input.owner_id))fail('请选择有权查看本订单的负责人',403);
  if(input.status!=='已完成'&&completed)fail('未完成环节请清空实际完成日期');
  const plan={...old,start,due,completed,status:input.status,owner_id:input.owner_id,next:text(input.next??'','进度及下一步'),evidence:text(input.evidence??'','执行与核对依据'),at,by:actor.id};
  if(plan.status==='已完成'&&old.status!=='已完成'){
   if(!row.details.contract_source)fail('请先核对原合同交接资料');
   const step={production:3,loading:5,shipping:6}[key];
   const pending=await db.prepare("SELECT id FROM crm_followup_tasks WHERE order_id=? AND step=? AND status='待处理' AND (CASE WHEN json_valid(meta) THEN json_extract(meta,'$.batch_id') ELSE NULL END IS NULL OR CASE WHEN json_valid(meta) THEN json_extract(meta,'$.batch_id') ELSE NULL END=?) LIMIT 1").bind(row.id,step,previous.id).first();
   if(pending)fail('本批环节仍有未解决待办或整单异常，请先核对处理');
  }
  after={...previous,name:text(body.name??previous.name,'批次名称',true,100),goods:text(body.goods??previous.goods,'本批货物及数量',true),container_no:text(body.container_no??previous.container_no,'柜号',false,500),bill_no:text(body.bill_no??previous.bill_no,'运输或提单号',false,500),inspection:text(body.inspection??previous.inspection,'验货放行依据'),phases:{...previous.phases,[key]:plan}};
  if(before.some(b=>b.id!==after.id&&b.name===after.name))fail('批次名称已存在');
  for(let i=0;i<BATCH_PHASES.length;i++){
   const phase=BATCH_PHASES[i],p=after.phases[phase.key];if(p.status!=='已完成')continue;
   if(!p.completed||p.completed>today)fail('请填写实际发生的'+phase.label+'完成日期');
   if(!p.evidence.trim())fail('请填写本批'+phase.label+'的执行与核对依据');
   if(i>0){const prior=after.phases[BATCH_PHASES[i-1].key];if(prior.status!=='已完成')fail('请先完成本批'+BATCH_PHASES[i-1].label+'，其他批次可继续生产');if(p.completed<prior.completed)fail('本批'+phase.label+'日期不能早于前一环节完成日期');}
  }
  if(after.phases.loading.status==='已完成'&&!after.container_no)fail('本批装柜完成前请填写柜号');
  if(after.phases.loading.status==='已完成'&&row.details.execution?.profile?.inspection&&!after.inspection)fail('请填写本批验货及放行依据');
  if(after.phases.shipping.status==='已完成'&&!after.bill_no)fail('本批发货完成前请填写运输或提单号');
  if(key==='shipping'&&plan.status==='已完成'&&old.status!=='已完成'){
   if(!row.details.contract_source)fail('请先核对原合同交接资料');
   if(row.details.execution?.profile?.charge==='free'){
    if(row.details.execution.profile.type!=='replacement'||row.details.contract_source.amount_minor!==0||row.details.execution.stages?.release?.status!=='已完成')fail('请先取得本单免费补货发出批准');
   }else{const release=await shippingRelease(db,row);plan.release_id=release.id;plan.release_revision=row.commercial_revision;}
  }
 }
 const batches=body.action==='create'?[...before,after]:before.map(b=>b.id===after.id?after:b);
 return writeFollowup(db,row,body,actor,body.action==='create'?'新增出货批次':'更新出货批次',{batch_id:after.id,phase:body.phase||'production',before:previous||null,after},()=>[],{...row,details:{...row.details,shipment_batches:batches}});
}
