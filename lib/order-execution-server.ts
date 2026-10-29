import {AllocationError} from './allocation-server';
import {can,now} from './crm';
import {followupOrder,writeFollowup} from './order-followup-server';
import {quoteCatalogue,quoteAccount} from './sales-quote-source';
import {paymentSummary} from './workflow-server';
import {executionStages,executionCurrent,EXECUTION_TYPES,type ExecutionProfile} from './order-execution';
const fail=(m:string,s=400):never=>{throw new AllocationError(m,s);};
const text=(v:any,label:string,required=true,max=5000)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())fail('请填写'+label+'（不超过'+max+'字）');return v.trim();};
function day(v:any,label:string){const s=text(v,label,true,10);if(!/^\d{4}-\d\d-\d\d$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)fail(label+'日期无效');return s;}
function profile(v:any):ExecutionProfile{
 if(!v||!Object.hasOwn(EXECUTION_TYPES,v.type)||!['sea','express','land'].includes(v.shipping)||!['ours','customer','none'].includes(v.installation)||!['paid','free'].includes(v.charge)||typeof v.production!=='boolean'||typeof v.inspection!=='boolean')fail('请完整选择本单类型与实际执行范围');
 if(v.charge==='free'&&v.type!=='replacement')fail('免费模式仅适用于经批准的售后补货');
 return {type:v.type,shipping:v.shipping,installation:v.installation,charge:v.charge,production:v.production,inspection:v.inspection,parent_contract:text(v.parent_contract||'','原合同编号',v.type!=='equipment',100),reason:text(v.reason,'执行范围确认依据')};
}
const origin='https://yifunlife-erp.yifunlife.workers.dev';
export async function executionQuote(db:D1Database,source:D1Database|undefined,u:any,quoteId:string){
 if(u.role==='followup')fail('报价与合同资料由商务或管理人员关联',403);
 if(!source)fail('报价读取连接尚未配置',503);
 const shared=await db.prepare("SELECT q.id FROM crm_sales_quote_links q JOIN crm_sales_projects p ON p.project_id=q.project_id JOIN crm_leads l ON l.id=p.lead_id WHERE l.owner_id=? AND json_extract(q.summary,'$.bridge_shared')=1 AND EXISTS(SELECT 1 FROM json_each(q.summary,'$.versions') v WHERE json_extract(v.value,'$.id')=?)").bind(u.id,quoteId).first();
 const email=shared?null:await quoteAccount(db,source,u);
 const q:any=await source!.prepare('SELECT id,contract_no,project_name,customer_name,created_by,is_finalized,final_amount,final_currency,confirmed_at,voided_at,archived_at,project_status FROM quotation_history WHERE id=?'+(email?' AND created_by=?':'')).bind(quoteId,...(email?[email]:[])).first();
 if(!q)fail('报价不存在或无权读取',404);
 if(!q.is_finalized||q.final_amount==null||q.voided_at||q.archived_at||q.project_status==='lost')fail('请选择已确认成交且当前有效的报价版本');
 const saved:any=await source!.prepare('SELECT id,data_json,created_at FROM quotation_handovers WHERE quotation_id=? ORDER BY rowid DESC LIMIT 1').bind(q.id).first();
 if(!saved)fail('该报价尚无商务交接资料，请先到报价系统补齐并保存');
 const d=JSON.parse(saved.data_json);
 if(d.confirmedAt!==(q.confirmed_at||'')||d.finalAmount!==q.final_amount||d.currency!==(q.final_currency||d.currency)||d.quotationId!==q.id||d.contractNo!==q.contract_no)fail('报价已变化，请商务重新确认交接资料后关联',409);
 return {kind:'quote',quote_id:q.id,handover_id:saved.id,contract_no:q.contract_no,customer:q.customer_name||d.customerName,amount_minor:Math.round(q.final_amount*100),currency:q.final_currency||d.currency,payment_terms:d.paymentTerms||'',delivery_notes:d.deliveryNotes||'',customer_confirmation:d.customerConfirmation||'',supply_scope:(d.items||[]).map((i:any)=>[i.sku,i.name,i.specification,i.quantity,i.unit].filter(x=>x!==undefined&&x!==null&&x!=='').join(' · ')).join('\n'),files:(d.files||[]).map((f:any)=>({id:f.id,name:f.filename,url:origin+'/api/quotation-handover?quotation='+encodeURIComponent(q.id)+'&file='+encodeURIComponent(f.id)})),quote_url:origin+'/?quotationHistory='+encodeURIComponent(q.id),handover_url:origin+'/api/quotation-handover?quotation='+encodeURIComponent(q.id)+'&id='+encodeURIComponent(saved.id),saved_at:saved.created_at};
}
async function shippingRelease(db:D1Database,row:any){
 const release:any=await db.prepare('SELECT r.*,c.version AS current_version FROM crm_workflow_releases r JOIN crm_workflow_contracts c ON c.deal_id=r.deal_id JOIN crm_deals d ON d.id=r.deal_id WHERE r.order_id=? AND r.deal_id=? AND d.cancelled=0').bind(row.id,row.deal_id).first();
 if(!release||release.current_version!==release.contract_version)fail('请商务或管理员先在“应收与放行”完成有效发货放行');
 const payment=await paymentSummary(db,row.deal_id);
 if(!release.special&&(payment.cross_currency||payment.net_minor<payment.ship_due_minor))fail('当前回款已不满足发货条件，请商务重新核对放行');
 return release;
}
export async function executionEndpoint(db:D1Database,source:D1Database|undefined,u:any,actor:any,path:string,method:string,body:any,url:URL){
 if(path==='followup/execution/quotes'&&method==='GET'){if(u.role==='followup')fail('跟单员不能浏览报价库',403);return quoteCatalogue(db,source,u,(url.searchParams.get('q')||'').slice(0,200));}
 const m=/^followup\/orders\/([a-z0-9-]+)\/execution(?:\/(configure|source|stage|quote))?$/.exec(path);if(!m)return undefined;
 const {row,manager}=await followupOrder(db,u,m[1]);
 const commercial=u.id===row.commercial_id&&u.role!=='followup'&&can(u,'customers_edit');
 const sourceEditor=u.role!=='followup'&&(manager||commercial);
 if(method==='GET'){
  if(m[2]==='quote'){if(!sourceEditor)fail('没有商务资料关联权限',403);return executionQuote(db,source,u,url.searchParams.get('id')||'');}
  if(m[2])fail('请求方法不支持',405);
  return {flow:row.details.execution||null,source:row.details.contract_source||null,can_edit:manager&&!row.archived,can_source:sourceEditor&&!row.archived};
 }
 if(method!=='POST')fail('请求方法不支持',405);
 if(row.archived)fail('订单已归档，请先重新打开',409);
 if(!Number.isInteger(body?.version)||body.version!==row.version)fail('订单已更新，请刷新后重新填写',409);
 if(m[2]==='source'){
  if(!sourceEditor)fail('合同资料须由本单商务或管理人员确认',403);
  const evidence=text(body.evidence,'本单客户及合同对应关系确认依据');
  const p=row.details.execution?.profile as ExecutionProfile|undefined;if(!p)fail('请先确认订单类型与执行范围');
  if(Object.values(row.details.execution.stages||{}).some((s:any)=>s.status==='已完成'))fail('本单已开始执行，原交接版本已固定；变更请通过新增增项订单及原异常记录处理',409);
  let sourceData:any;
  if(body.quote_id){sourceData=await executionQuote(db,source,u,text(body.quote_id,'报价版本',true,100));
   if(p!.charge==='free'){if(sourceData.contract_no!==p!.parent_contract)fail('免费补货须关联原合同对应报价');sourceData={...sourceData,parent_amount_minor:sourceData.amount_minor,amount_minor:0,supply_scope:text(body.supply_scope,'本次免费补货规格及数量'),payment_terms:'经批准免费补货，不产生合同应收'};}
   else if(sourceData.contract_no!==row.order_number)fail('报价合同编号须与本跟单编号一致，请选择对应订单版本');
  }else{
   const number=text(body.contract_no,'原合同编号',true,100);if(number!==row.order_number&&!(p!.charge==='free'&&number===p!.parent_contract))fail('合同编号与本单不一致');
   const a=String(body.amount??'');if(!/^\d+(\.\d{1,2})?$/.test(a)||!Number.isSafeInteger(Math.round(Number(a)*100)))fail('请填写有效合同金额');
   if(p!.charge==='free'&&Number(a)!==0)fail('免费补货本次金额应为零');
   sourceData={kind:'manual',contract_no:number,customer:text(body.customer,'合同客户',true,200),amount_minor:Math.round(Number(a)*100),currency:text(body.currency,'币种',true,3),supply_scope:text(body.supply_scope,'供货范围'),payment_terms:text(body.payment_terms,'合同付款条款'),delivery_notes:text(body.delivery_notes||'','交付说明',false),files:[]};
   if(!/^[A-Z]{3}$/.test(sourceData.currency))fail('币种须为三位英文大写');
  }
  if(p!.charge==='paid'&&sourceData.amount_minor<=0)fail('有应收款订单须登记正数合同金额');
  if(!sourceData.supply_scope?.trim()||!sourceData.payment_terms?.trim())fail('商务来源缺少供货范围或付款条款，请补齐后重新关联');
  const supplement={drawing:text(body.drawing||'','确认图纸或规格依据',false),drawing_version:text(body.drawing_version||'','图纸或规格版本',false,200),delivery_address:text(body.delivery_address,'交货地址'),customer_contact:text(body.customer_contact,'客户联系人及联系方式'),delivery_date:day(body.delivery_date,'合同约定交期'),special_requirements:text(body.special_requirements||'','包装运输安装要求',false)};
  if(p!.charge!=='free'&&!supplement.drawing&&!sourceData.files.length)fail('请商务补充确认图纸／规格依据或报价确认附件');
  sourceData={...sourceData,...supplement,evidence,confirmed_by:actor.id,confirmed_at:now()};
  const details={...row.details,contract_source:sourceData,supply_scope:sourceData.supply_scope,payment_nodes:sourceData.payment_terms,delivery_address:supplement.delivery_address,customer_contact:supplement.customer_contact,drawing_version:[supplement.drawing,supplement.drawing_version].filter(Boolean).join(' · '),quote_reference:sourceData.contract_no,delivery_requirements:sourceData.delivery_notes,special_requirements:supplement.special_requirements};
  return writeFollowup(db,row,body,actor,'确认合同交接资料',{before:row.details.contract_source||null,after:sourceData},()=>[],{...row,details});
 }
 if(!manager)fail('没有本订单跟单维护权限',403);
 if(m[2]==='configure'){
  const p=profile(body.profile),old=row.details.execution;
  if(old&&(old.stages&&Object.keys(old.stages).length||row.details.contract_source))fail('已有执行记录或合同资料，不能覆盖订单类型与范围；请保留本单并建立对应增项或补货单',409);
  const execution={version:1,profile:p,stages:{},current_key:'handover',current_name:executionStages(p)[0].name,configured_by:actor.id,configured_at:now()};
  return writeFollowup(db,row,body,actor,'确认分类跟单范围',{profile:p,legacy_preserved:true,previous_stage:row.stage},()=>[],{...row,details:{...row.details,execution},stage:0});
 }
 if(m[2]==='stage'){
  const flow=row.details.execution;if(!flow)fail('请先确认执行范围');
  const stages=executionStages(flow.profile),stage=stages.find(s=>s.key===body.stage);if(!stage)return fail('本单不适用此阶段');
  if(!['draft','complete'].includes(body.action))fail('请选择保存草稿或完成本步');
  const complete=body.action==='complete',input=body.values;if(!input||typeof input!=='object'||Array.isArray(input))fail('表单格式无效');
  const current=executionCurrent(row)!;
  if(flow.stages?.[stage.key]?.status==='已完成')fail('已完成记录只读，请在跟单记录追加更正依据',409);
  if(complete&&current.key!==stage.key&&stage.key!=='freight')fail('请先完成当前阶段；货代安排可提前并行办理');
  const values:Record<string,string>={};for(const f of stage.fields){values[f.key]=text(input[f.key]??'',f.label,complete);if(values[f.key]&&f.type==='date')day(values[f.key],f.label);if(values[f.key]&&f.options&&!f.options.includes(values[f.key]))fail(f.label+'选项无效');if(complete&&f.pass&&!f.pass.includes(values[f.key]))fail('尚不能完成：'+f.label);}
  const due=body.due?day(body.due,'计划完成时间'):'';if(!due)fail('请填写本阶段计划完成时间');
  const problem=text(body.problem||'','待解决问题',false,2000),next=text(body.next||'','下一步',!complete,2000);
  if(complete){
   if(!row.details.contract_source)fail('请商务先关联并确认合同交接资料');
   if(stage.key==='receipt'&&values.condition==='曾有缺件或破损'&&values.issues!=='已解决')fail('缺件或破损须核实处理完成，不能填写无问题');
   if(problem)fail('仍有待解决问题，请处理后再完成');
   const tasks:any=await db.prepare("SELECT COUNT(*) n FROM crm_followup_tasks WHERE order_id=? AND status='待处理'"+(stage.key==='archive'?'':' AND step=?')).bind(row.id,...(stage.key==='archive'?[]:[stage.legacy])).first();if(tasks.n)fail('仍有未解决待办或异常，不能完成本步');
   if(['release','shipping'].includes(stage.key)&&flow.profile.charge==='paid')await shippingRelease(db,row);
   if(stage.key==='archive'&&stages.filter(s=>s.key!=='archive').some(s=>flow.stages?.[s.key]?.status!=='已完成'))fail('请先完成所有适用阶段');
  }
  const saved={values,due,problem,next,status:complete?'已完成':'进行中',by:actor.id,at:now()},execution={...flow,stages:{...flow.stages,[stage.key]:saved}};
  const details={...row.details,execution,dates:{...row.details.dates}};
  const milestones:Record<string,string>=stage.key==='freight'?{planned_ship:'pickup'}:stage.key==='shipping'?{actual_ship:'date',eta_site:'eta'}:stage.key==='arrival'?{eta_port:'eta',eta_site:'site'}:stage.key==='installation'?{installation:'date'}:{};
  const dateChanges:any[]=[];for(const [key,field]of Object.entries(milestones)){const value=values[field];if(!value)continue;const previous=details.dates[key];if(previous?.date&&previous.date!==value){const reason=text(body.date_change_reason,'日期变更原因');dateChanges.push({field:key,before:previous.date,after:value,reason});}
   if(previous?.date!==value)details.dates[key]={date:value,kind:key==='actual_ship'||key==='installation'?'实际':'预计',source:'订单执行：'+stage.name,confirmed_at:now(),updated_at:now(),sync_record:complete&&values.notice?'已于'+values.notice+'通知客户及商务':''};
  }
  const nextStage=executionCurrent({...row,details});
  execution.current_key=nextStage?.key;execution.current_name=nextStage?.name;
  return writeFollowup(db,row,body,actor,complete?'完成分类跟单阶段':'保存分类跟单表单',{stage:stage.key,before:flow.stages?.[stage.key]||null,after:saved,date_changes:dateChanges},()=>[],{...row,details,stage:nextStage?.legacy??row.stage,archived:stage.key==='archive'&&complete?1:0});
 }
 fail('跟单操作不存在',404);
}
