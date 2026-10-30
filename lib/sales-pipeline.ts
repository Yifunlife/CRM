export const SALES_CHANNELS=[['whatsapp','WhatsApp'],['email','邮件']] as const;
export const SALES_STAGES=[['replied','已回复待进一步沟通'],['design','设计沟通中'],['negotiation','订单价格交涉中']] as const;
export type ContactRecord={at:string;note:string};
export type SalesProgress={version:number;auto_next_date?:string;auto_message_at?:string;required?:string[];first:Record<string,ContactRecord>;second:Record<string,ContactRecord>;reply_at:string;stage:string;stage_at:string};
export const salesDay=(value:string)=>new Date(value).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
export const salesLocal=(value:string)=>value?new Date(Date.parse(value)+8*3600000).toISOString().slice(0,16):'';
export const salesISO=(value:string)=>value?new Date(value+':00+08:00').toISOString():'';
export const salesStamp=(value:string)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'待补充';
export const daysBetween=(from:string,to:string)=>Math.max(0,Math.round((Date.parse(salesDay(to))-Date.parse(salesDay(from)))/86400000));
export function salesState(lead:any):SalesProgress{const detail=typeof lead.detail==='string'?JSON.parse(lead.detail):lead.detail;return {version:0,first:{},second:{},reply_at:'',stage:'',stage_at:'',...detail?._sales_progress};}
export function salesSummary(lead:any,at=new Date().toISOString(),orders:any[]=[],deals:any[]=[]){
 const state=salesState(lead),required=state.required||[...(lead.phone?['whatsapp']:[]),...(lead.email?['email']:[])];
 const completed=(round:Record<string,ContactRecord>)=>required.length&&required.every(c=>round[c]?.at)?required.map(c=>round[c].at).sort().at(-1)||'':'';
 const first=completed(state.first),second=completed(state.second),due=first?new Date(Date.parse(salesDay(first))+7*86400000).toISOString().slice(0,10):'';
 const won=deals.length>0,activeOrders=orders,linked=deals.filter(d=>d.has_order??activeOrders.some(o=>o.deal_id===d.id)).length;
 const historical=lead.cohort==='historical'&&lead.assignment_category!=='new';
 const unverified=!first&&!Object.keys(state.first).length&&!!(lead.last_contact||!['待首次联系','已结束','暂停跟进'].includes(lead.status));
 const stage=won?'won':lead.status==='已结束'?'ended':lead.status==='暂停跟进'?'paused':state.stage||(historical?'historical':!first?(unverified?'unverified':Object.keys(state.first).length?'partial':'untouched'):second?'second_done':salesDay(at)>due?'second_overdue':'second_pending');
 const labels:Record<string,string>={historical:'历史客资 · 默认已联系',won:linked<deals.length?'已成交待交接':'已成交跟单中',ended:'已结束',paused:'暂停跟进',unverified:'历史跟进待核实',partial:'初步沟通待补齐',untouched:'待初次联系',second_done:'二次跟进已完成',second_overdue:'二次跟进逾期',second_pending:'已初步沟通 · 待二次跟进',...Object.fromEntries(SALES_STAGES)};
 return {cohort:lead.cohort||'unknown',customer_type:won?'existing':'new',id:lead.id,name:lead.name,owner_id:lead.owner_id,owner_name:lead.owner_name||lead.original_owner||'待分配',grade:lead.grade||'',assigned_at:lead.assigned_at||'',waiting_days:lead.assigned_at?daysBetween(lead.assigned_at,at):null,stage,label:labels[stage]||'待核实',first_at:first,second_at:second,second_due:due,second_late:!!second&&salesDay(second)>due,second_overdue:!!due&&!second&&salesDay(at)>due,reply_at:state.reply_at,idle_days:state.reply_at?daysBetween(state.reply_at,at):null,stage_at:state.stage_at,stage_days:state.stage_at?daysBetween(state.stage_at,at):null,required,state,orders,deal_count:deals.length,handover_pending:deals.length-linked};
}
