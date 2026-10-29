export const ORDER_STEPS=[
 {name:'订单接收与交接',checks:['合同及订单编号已核对','产品规格、数量及供货范围已核对','客户确认图纸及版本已核对','交货地点、要求及交期已核对','付款节点及付款确认情况已核对','客户联系人及各部门负责人已记录','包装、运输、报关及安装要求已核对','缺项已明确补充人和完成时间']},
 {name:'设计进度跟进',checks:['设计负责人及交付时间已记录','客户确认事项已跟进','客户确认设计版本已留存']},
 {name:'报价核算资料整理',checks:['业务及核算部门已对接','确认版本及核算资料已整理','审批记录已留存']},
 {name:'设备订单与进度跟进',checks:['技术与商务负责人已明确','设备进度及交期已跟进','付款节点及确认情况已跟进']},
 {name:'货代安排确认',checks:['已确认我方或客户安排货代','货代联系人及联系方式已取得','提货或装柜时间、地点和文件已对接','涉及费用已提前告知商务并取得确认']},
 {name:'发货前最终核对',checks:['货物名称、规格、数量及供货范围一致','包装、唛头及特殊要求已落实','收货信息已核对','发票、装箱单及报关文件齐全一致','提货、装柜及货代安排已确认','商务与财务已确认付款及发货条件','已取得发货确认']},
 {name:'发货执行与资料更新',checks:['实际发货时间及运输编号已记录','装柜照片及适用运输资料已整理','已核对资料并同步客户及商务','待补资料已补齐或列入待办']},
 {name:'运输及到达前跟进',checks:['已联系货代或船公司核实最新预计到达时间','无论有无查询结果均已主动联系客户','清关、提货、收货及补充资料需求已确认','到港与到客户现场时间分别记录']},
 {name:'收货确认与问题处理',checks:['已确认客户收货情况','缺件、破损及其他问题已记录','相关问题处理结果已核实']},
 {name:'安装交接与进度跟进',checks:['项目资料、现场联系人及时间已交接','工程／安装负责人已明确','安装进度及问题已跟进','处理结果已核实']},
 {name:'交付验收与资料汇总',checks:['交付与验收情况已确认','问题处理记录已汇总','未解决事项已核对']},
 {name:'订单归档',checks:['合同及确认图纸已归档','发货单证及物流资料已归档','收货、验收及问题处理记录已归档','所有待办及异常均已解决']}
];
export const ORDER_FIELDS=[
 ['production_progress','生产当前进度'],['purchase_progress','采购当前进度'],['supply_scope','产品名称、规格、数量及供货范围'],['drawing_version','客户确认图纸／方案版本'],['quote_reference','报价编号／确认版本'],['costing_reference','核算及审批记录'],['delivery_address','交货地点／收货地址'],['delivery_requirements','交货要求与约定交期'],['payment_nodes','付款节点'],['payment_status','当前付款确认情况'],['customer_contact','客户联系人及联系方式'],['design_contact','设计负责人及交付时间'],['engineering_contact','工程／技术负责人'],['installation_contact','安装负责人及现场联系人'],['special_requirements','包装、运输、报关、安装特殊要求'],['handover_gaps','交接缺项、补充人及完成时间']
] as const;
export const LOGISTICS_FIELDS=[['forwarder_mode','货代安排（我方／客户／待确认）'],['forwarder_contact','货代联系人及联系方式'],['pickup','提货／装柜时间及地点'],['transport_requirements','目的地、收货信息与运输要求'],['commercial_confirmation','商务费用确认记录'],['release_confirmation','商务、财务付款及发货确认记录'],['container_no','柜号'],['seal_no','封条号'],['bill_no','提单号／物流单号'],['missing_documents','待补资料及预计取得时间'],['receipt','收货确认及问题'],['acceptance','交付验收记录']] as const;
export const ORDER_DATES=[['production_ordered','下单生产'],['purchase_ordered','下单采购'],['planned_ship','计划发货'],['actual_ship','实际发货'],['eta_port','预计到港'],['eta_site','预计到客户现场'],['inspection','预计验货'],['installation','安装日期']] as const;
export const orderToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
export const blankSteps=()=>ORDER_STEPS.map(()=>({status:'待处理',checks:[] as number[],note:'',by:'',at:'',for_date:''}));
export function orderReminders(order:any,tasks:any[],today=orderToday()){
 if(order.archived)return [];
 const out:{key:string;title:string;due:string;overdue:boolean}[]=[];
 const flow=order.details?.execution;
 if(flow)for(const [key,item] of Object.entries(flow.stages||{}) as [string,any][]){if(item.status!=='已完成'&&item.due&&item.due<=today)out.push({key:'execution-'+key,title:(key===flow.current_key?flow.current_name:'执行事项')+' · 到期处理',due:item.due,overdue:item.due<today});}
 if(flow?.profile.production&&flow.stages?.handover?.status==='已完成'&&flow.stages?.production?.status!=='已完成'){const contact=[flow.stages?.production?.values?.contact_date||'',flow.last_factory_at||'',flow.stages.handover.at?.slice(0,10)||''].sort().at(-1);if(contact){const due=new Date(Date.parse(contact)+7*86400000).toISOString().slice(0,10);if(due<=today)out.push({key:'factory-weekly',title:'工厂生产进度 · 至少每周跟进',due,overdue:due<today});}}
 for(const [key,label] of ORDER_DATES.filter(([key])=>!['production_ordered','purchase_ordered'].includes(key))){const item=order.details?.dates?.[key];if(item?.date&&item.updated_at&&!item.sync_record){const due=new Date(item.updated_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});out.push({key:key+'-sync',title:label+'日期需同步商务及客户',due,overdue:due<today});}}
 for(const [key,index,days,title] of [['planned_ship',4,10,'发货前10天确认货代'],['eta_port',7,7,'到港前7天联系客户']] as const){
  if(flow&&flow.profile.shipping!=='sea')continue;
  const date=order.details?.dates?.[key]?.date,step=order.steps?.[index];
  if(flow&&flow.stages?.[index===4?'freight':'arrival']?.status==='已完成'&&flow.stages[index===4?'freight':'arrival'].values[index===4?'pickup':'eta']===date)continue;
  if(date&&!( !flow&&step?.status==='已完成'&&step.for_date===date)){
   const due=new Date(Date.parse(date+'T00:00:00Z')-days*86400000).toISOString().slice(0,10);
   if(today>=due)out.push({key,title,due,overdue:today>due});
  }
 }
 for(const task of tasks.filter(t=>t.status==='待处理')){
  const next=task.next_followup?.slice(0,10),due=task.due_at?.slice(0,10);
  if(due&&due<=today)out.push({key:task.id,title:task.title+' · 到期处理',due,overdue:due<today||(due===today&&Date.parse(task.due_at)<Date.now())});
  else if(next&&next<=today)out.push({key:task.id,title:task.title+' · 到期跟进',due:next,overdue:next<today||(next===today&&Date.parse(task.next_followup)<Date.now())});
 }
 return out;
}
