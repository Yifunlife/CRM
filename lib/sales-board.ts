import {DELIVERY_STAGES,deliveryStage} from './role-workspace';
import {FOLLOWUP_NODES,processSummary} from './followup-board';

export function rankBoardPeople(rows:any[],basis:string){
 const value=(p:any)=>basis==='monthly'?p.total_minor:basis==='customers'?p.new_customers:basis==='grade'?p.effective_customers:p.annual_total_minor;
 const unknown=(p:any)=>basis==='annual'?p.annual_unverified:basis==='monthly'?p.unverified:0;
 const sorted=[...rows].sort((a,b)=>Number(!!unknown(a))-Number(!!unknown(b))||value(b)-value(a)||a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id));
 let previous:number|undefined,rank=0;
 return sorted.map((row,index)=>{if(unknown(row))return {...row,rank:null};if(value(row)!==previous)rank=index+1;previous=value(row);return {...row,rank};});
}

export function boardFollowups(orders:any[],people:any[],tasks:any[],today:string){
 return people.filter(p=>p.active&&(p.role==='followup'||orders.some(o=>o.logistics_id===p.id&&!o.archived))).map(person=>{
  const projects=new Map<string,any>();
  for(const order of orders.filter(o=>o.logistics_id===person.id&&!o.archived&&deliveryStage(o)!=='已完成').sort((a,b)=>(b.updated||'').localeCompare(a.updated||'')||a.id.localeCompare(b.id))){
   const stage=deliveryStage(order),nodes=FOLLOWUP_NODES.map(node=>({...node,...processSummary(order,node,tasks)}));
   const current=nodes.find(node=>!['已完成','不适用'].includes(node.status));
   const ship=order.details?.dates?.planned_ship?.date||'',shipped=order.details?.dates?.actual_ship?.date;
   const overdue=nodes.some(node=>!['已完成','不适用'].includes(node.status)&&node.due&&node.due<today)||!!ship&&ship<today&&!shipped;
   const key=order.sales_project_id?'sales:'+order.sales_project_id:order.deal_id?'deal:'+order.deal_id:'order:'+order.id;
   const previous=projects.get(key);
   projects.set(key,previous?{...previous,overdue:overdue||previous.overdue}:{id:order.id,name:order.project,stage,node:current?.label||stage,next:current?.next||'',due:current?.due||ship,overdue});
  }
  const rows=[...projects.values()];
  return {id:person.id,name:person.name,projects:rows.length,overdue:rows.filter(p=>p.overdue).length,stages:DELIVERY_STAGES.filter(s=>s!=='已完成').map(name=>({name,count:rows.filter(p=>p.stage===name).length})),rows};
 });
}
