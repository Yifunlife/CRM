export const FOLLOWUP_NODES=[
 {page:'接单确认',label:'接单确认',step:0,execution:['handover'],legacy:[0]},
 {page:'生产跟进',label:'生产跟进',step:3,execution:['production','stock'],legacy:[3]},
 {page:'出货交付',label:'出货交付',step:6,execution:['inspection','freight','release','shipping'],legacy:[4,5,6]},
 {page:'单证制作',label:'单证制作',step:5,execution:[],legacy:[]},
 {page:'核对提单',label:'核对提单',step:7,execution:[],legacy:[]},
 {page:'费用对账',label:'费用对账',step:4,execution:[],legacy:[]},
 {page:'跟进收款',label:'收款归档',step:11,execution:[],legacy:[]}
] as const;
export const PROCESS_STATUSES=['未开始','进行中','待确认','已完成','不适用'] as const;
export function processSummary(order:any,node:typeof FOLLOWUP_NODES[number],tasks:any[]=[]){
 const saved=order.details?.business_process?.[node.page];
 const pending=tasks.filter(t=>t.order_id===order.id&&t.step===node.step&&t.status==='待处理');
 let status='未开始';
 if(node.page==='跟进收款')status=order.archived?'已完成':saved?'进行中':'未开始';
 else if(saved?.status&&PROCESS_STATUSES.includes(saved.status))status=saved.status;
 else if(saved)status='已记录';
 else {
  const stages=order.details?.execution?.stages;
  const states=stages?node.execution.map(k=>stages[k]).filter(Boolean):node.legacy.map(k=>order.steps?.[k]).filter(Boolean);
  if(states.length&&states.every(s=>['已完成','不适用'].includes(s.status)))status=states.every(s=>s.status==='不适用')?'不适用':'已完成';
  else if(states.some(s=>s.status&&s.status!=='待处理'||s.note||s.next))status='进行中';
 }
 if(pending.length&&['已完成','不适用'].includes(status))status='待确认';
 const completed=['已完成','不适用'].includes(status);
 const businessDate=(value:string)=>value?.includes('T')?new Date(value).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}):value||'';
 const due=businessDate(pending[0]?.due_at||saved?.due||'');
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 const overdue=!completed&&!!due&&due<today;
 const exception=pending.some(t=>{let meta=t.meta||{};if(typeof meta==='string'){try{meta=JSON.parse(meta);}catch{meta={};}}return t.kind==='异常'||['重大','紧急'].includes(meta.priority);});
 const problem=node.execution.some(k=>{const stage=order.details?.execution?.stages?.[k];return stage&&stage.status!=='已完成'&&!!stage.problem?.trim();});
 const warning=!order.archived?(overdue?'已逾期':exception||problem?'异常待处理':''):'';
 const tone=warning?'error':status==='已完成'?'done':status==='进行中'?'active':['待确认','已记录'].includes(status)?'wait':'pending';
 return {status,tone,warning,owner_id:pending[0]?.owner_id||saved?.owner_id||order.logistics_id,owner_name:pending[0]?.owner_name||(saved?.owner_id===order.commercial_id?order.commercial_name:!saved?.owner_id||saved.owner_id===order.logistics_id?order.logistics_name:''),next:pending[0]?.next_action||saved?.next||(completed?'已核对，点击查看':'待安排'),due,pending:pending.length};
}
