export const CONTACT_TYPES=['首次联系','二次跟进','后续跟进','客户实际回复','需求沟通','方案确认','报价已发送','会议到访','合同确认'] as const;
export const CONTACT_RESULTS=['未接通 / 未联系上','已联系，等待客户回复','客户已回复','等待客户提供资料','已收到客户资料','需求已确认','设计已下单','方案已发送，等待反馈','客户要求调整方案','报价已发送，等待反馈','价格 / 条款协商中','合同待确认','合同已确认','客户暂缓项目','客户明确不考虑','其他'] as const;
export const CONTACT_ACTIONS=['首次联系客户','再次联系客户','跟进客户回复','索取场地 / 图纸资料','核实需求与预算','安排方案设计','跟进设计进度','跟进方案调整','发送方案','制作并发送报价','跟进报价反馈','协商价格与条款','跟进合同确认','核对订单进度','跟进付款','安排会议 / 到访','其他'] as const;
export const CONTACT_REASONS=['客户计划推迟','预算未落实','场地未确定','报价不符合预算','客户选择其他供应商','需求取消','长期无回复','其他'] as const;
export const OPENING_STAGES=['方案与合同确认','生产','运输与清关','安装调试','开业准备'] as const;
export type OpeningPlan={entity:string;opening:string;phase:number;remaining:number;days:number[];buffer:number;remind:number};
export const day=(at=new Date().toISOString())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(at));
export const addDays=(date:string,n:number)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export const daysBetween=(a:string,b:string)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
export const validDate=(v:any):v is string=>typeof v==='string'&&/^20\d\d-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&addDays(v,0)===v;
export const personalTodoDue=(date:string,today=day())=>validDate(date)&&date<=today;
export function openingSchedule(p:OpeningPlan,today=day()){
 const latest=OPENING_STAGES.map((name,j)=>{const finish=addDays(p.opening,-p.buffer-p.days.slice(j+1).reduce((a,b)=>a+b,0));return {name,start:addDays(finish,-p.days[j]),finish};});
 const remaining=p.remaining+p.days.slice(p.phase+1).reduce((a,b)=>a+b,0),ready=addDays(today,remaining),late=daysBetween(ready,p.opening),slack=daysBetween(addDays(p.opening,-p.buffer),ready),due=daysBetween(latest[p.phase].finish,today);
 return {latest,ready,due,late,slack,text:late>0?'预计晚开业 '+late+' 天':slack<0?'开业缓冲不足 '+(-slack)+' 天':due<0?'节点已逾期 '+(-due)+' 天':due<=p.remind?'节点 '+due+' 天内到期':slack<=p.remind?'机动余量仅 '+slack+' 天':'按所填周期可赶上'};
}
export function designDeadline(records:any[]){
 const n=[...records].sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)||b.created.localeCompare(a.created)).find(e=>validDate(e.payload.proposal_date)||e.payload.result==='方案已发送，等待反馈');
 return n&&n.payload.result!=='方案已发送，等待反馈'?n.payload.proposal_date as string:'';
}
export function noteType(note:any){return note.meta?.type||(/^首次/.test(note.method)?'首次联系':/^二次/.test(note.method)?'二次跟进':note.method==='客户回复'?'客户实际回复':'后续跟进');}
export function projectFinancials(order:any,deals:any[],receipts:any[]){
 const d=deals.find(d=>d.id===order.deal_id);if(!d||d.total_minor==null||!d.currency)return {currency:'',amount:null,received:null,outstanding:null};
 const rows=receipts.filter(r=>r.deal_id===d.id),mixed=rows.some(r=>r.currency!==d.currency),received=rows.filter(r=>r.currency===d.currency).reduce((n,r)=>n+r.amount_minor-r.refunded_minor,0);
 return {currency:d.currency,amount:d.total_minor,received:mixed?null:received,outstanding:mixed?null:d.total_minor-received};
}
