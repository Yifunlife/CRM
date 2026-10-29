export const PROJECT_STAGES=[['qualification','需求确认'],['design','方案设计'],['quoted','已报价'],['negotiation','价格交涉'],['contract','合同确认'],['won','已成交'],['lost','未成交'],['paused','暂停推进']] as const;
export const FORECASTS=[['early','早期项目'],['best','争取成交'],['commit','承诺成交']] as const;
export const TASK_KINDS=[['collaboration','成交前协作'],['followup','销售跟进'],['revival','客户唤醒'],['callback','交付回访'],['service','售后事项'],['expansion','扩店增购'],['referral','转介绍与案例']] as const;
export const QUALIFICATION_FIELDS=[['site','场地状态与租赁情况'],['drawing','平面图与确认版本'],['area','面积与净高'],['budget','预算金额、币种及范围'],['decision','决策人及采购流程'],['purchase','采购决定时间'],['opening','目标开业时间'],['scope','供货范围与当地要求']] as const;
export const CLOSED_STAGES=['won','lost','paused'];
export function dormantReason(l:any,at=new Date().toISOString()){
 const today=suiteDay(at),task=l.revival?JSON.parse(l.revival):null;
 if(l.review||l.status==='已成交'||l.next_date>today)return '';
 if(task?.outcome==='已无需求'||task?.review_date>today)return '';
 const dates=[l.last_contact,l.created,l.note_at,l.assigned_at,task?.status==='done'?task.updated:null].map(v=>Date.parse(v||'')).filter(Number.isFinite);
 if(!dates.length)return '';
 const days=Math.floor((Date.parse(at)-Math.max(...dates))/86400000);
 if(days<0)return '';
 if(days>=30)return `已 ${days} 天没有联系记录`;
 return ['暂停跟进','已结束'].includes(l.status)?`${l.status}，未安排后续复查`:'';
}
export const suiteDay=(at=new Date().toISOString())=>new Date(at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
export const suiteStamp=(at:string)=>at?new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'待确认';
export const suiteLocal=(at:string)=>at?new Date(Date.parse(at)+8*3600000).toISOString().slice(0,16):'';
export const suiteISO=(at:string)=>at?new Date(at+':00+08:00').toISOString():'';
export const moneyLabel=(minor:number|null|undefined,currency='USD')=>minor==null?'金额待核实':currency+' '+(minor/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
export function suiteForecast(projects:any[],month:string){
 const totals:Record<string,any>={};
 for(const p of projects.filter(p=>!CLOSED_STAGES.includes(p.stage))){const c=totals[p.currency]||={currency:p.currency,open_count:0,known_minor:0,unknown_count:0,month_minor:0,month_count:0,undated:0,categories:{early:0,best:0,commit:0},review_pending:0};c.open_count++;if(p.amount_minor==null)c.unknown_count++;else c.known_minor+=p.amount_minor;if(!p.expected_date)c.undated++;if(p.expected_date?.startsWith(month)){c.month_count++;if(p.amount_minor!=null){c.month_minor+=p.amount_minor;c.categories[p.forecast]+=p.amount_minor;}if(p.forecast==='commit'&&!p.forecast_review)c.review_pending++;}}
 return Object.values(totals);
}
// Amount calculation mirrors the quotation system; cost fields never leave the source reader.
export function quoteCommercialAmount(raw:string|null){
 let s:any;try{s=JSON.parse(raw||'{}');}catch{return {amount_minor:null,currency:'USD'};}
 const currency=s.priceMode==='usd'?'USD':'CNY',finite=(v:any)=>typeof v==='number'&&Number.isFinite(v)?v:0;
 const products=[...new Map((s.products||[]).map((p:any,i:number)=>[p.id||'row:'+i,p])).values()] as any[];
 let count=0;const subtotal=products.reduce((n:number,p:any)=>{if(['deleted','customer'].includes(p.revision?.status))return n;const quantity=Math.max(0,p.quoteCosting?finite(s.cart?.[p.id]):Math.floor(finite(s.cart?.[p.id]))),toy=p.tags?.includes('配套玩具')||p.category3==='配套玩具',price=currency==='USD'?p.usd:s.priceMode==='factory'&&!toy?p.factory:p.price;if(!quantity||typeof price!=='number'||!Number.isFinite(price))return n;count++;return n+quantity*price;},0);
 const f=s.fees||{},pre=subtotal+finite(f.packaging)+finite(f.formaldehyde)+finite(f.shipping)+finite(f.installation),total=pre+(currency==='CNY'&&s.includeTax!==false?pre*.13:0)-(s.showDesignDeduction?finite(f.designDeduction):0);
 return {amount_minor:count&&Number.isFinite(total)?Math.round(total*100):null,currency};
}
