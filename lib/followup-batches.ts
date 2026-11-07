export const BATCH_PHASES=[{key:'production',label:'生产',page:'生产跟进'},{key:'loading',label:'装柜',page:'出货交付'},{key:'shipping',label:'发货',page:'出货交付'}] as const;
export type BatchPhase=typeof BATCH_PHASES[number]['key'];
export type BatchPlan={start:string;due:string;owner_id:string;status:string;completed:string;next:string;evidence:string;at?:string;by?:string;release_id?:string;release_revision?:number};
export type ShipmentBatch={id:string;name:string;goods:string;container_no:string;bill_no:string;inspection:string;phases:Record<BatchPhase,BatchPlan>;created:string;created_by:string};
export function shipmentBatches(order:any):ShipmentBatch[]{return Array.isArray(order?.details?.shipment_batches)?order.details.shipment_batches:[];}
export function batchNodePlan(order:any,page:string){
 const batches=shipmentBatches(order);if(!batches.length||!['生产跟进','出货交付'].includes(page))return null;
 const keys:BatchPhase[]=page==='生产跟进'?['production']:['loading','shipping'],plans=batches.flatMap(b=>keys.map(k=>b.phases[k]));
 const complete=batches.every(b=>b.phases[page==='生产跟进'?'production':'shipping'].status==='已完成'),active=plans.filter(p=>p.status!=='已完成'),focus=[...active].sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'))[0]||plans[plans.length-1];
 return {status:complete?'已完成':plans.some(p=>p.status==='待确认')?'待确认':plans.some(p=>['进行中','已完成'].includes(p.status))?'进行中':'未开始',start:plans.map(p=>p.start).filter(Boolean).sort()[0]||'',due:focus.due,owner_id:focus.owner_id,next:focus.next||'按出货批次独立跟进',confirmed_at:plans.map(p=>p.at||'').sort().at(-1)||''};
}
export function batchesReady(order:any,key:BatchPhase){const batches=shipmentBatches(order);return !batches.length||batches.every(b=>b.phases[key].status==='已完成');}
export function batchTone(plan:BatchPlan,today:string){return plan.status==='已完成'?'done':plan.due&&plan.due<today?'error':plan.status==='待确认'?'wait':plan.status==='进行中'?'active':'pending';}
