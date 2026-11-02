import {FOLLOWUP_NODES,processNodeStatus} from './order-followup';
export {FOLLOWUP_NODES} from './order-followup';
export const PROCESS_STATUSES=['未开始','进行中','待确认','已完成','不适用'] as const;
export function processSummary(order:any,node:typeof FOLLOWUP_NODES[number],tasks:any[]=[]){
 const saved=order.details?.business_process?.[node.page];
 const pending=tasks.filter(t=>t.order_id===order.id&&t.step===node.step&&t.status==='待处理');
 let status=processNodeStatus(order,node.page);
 if(pending.length&&['已完成','不适用'].includes(status))status='待确认';
 const completed=['已完成','不适用'].includes(status);
 const businessDate=(value:string)=>value?.includes('T')?new Date(value).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}):value||'';
 const due=businessDate(pending[0]?.due_at||saved?.due||'');
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 const overdue=!completed&&!!due&&due<today;
 const exception=pending.some(t=>{let meta=t.meta||{};if(typeof meta==='string'){try{meta=JSON.parse(meta);}catch{meta={};}}return t.kind==='异常'||['重大','紧急'].includes(meta.priority);});
 const problem=node.execution.some(k=>{const stage=order.details?.execution?.stages?.[k];return stage&&stage.status!=='已完成'&&!!stage.problem?.trim();});
 const warning=!order.archived?(overdue?'已逾期':exception||problem||saved?.problem?'异常待处理':''):'';
 const tone=warning?'error':status==='已完成'?'done':status==='进行中'?'active':['待确认','已记录'].includes(status)?'wait':'pending';
 return {status,tone,warning,owner_id:pending[0]?.owner_id||saved?.owner_id||order.logistics_id,owner_name:pending[0]?.owner_name||(saved?.owner_id===order.commercial_id?order.commercial_name:!saved?.owner_id||saved.owner_id===order.logistics_id?order.logistics_name:''),next:pending[0]?.next_action||saved?.next||(completed?'已核对，点击查看':'待安排'),due,pending:pending.length};
}
