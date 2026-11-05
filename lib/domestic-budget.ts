import {sourceRecord} from './customer-origin';
export const DOMESTIC_PRIORITY_BUDGET_CNY=2_000_000;
export type DomesticBudget={minimum:number|null;qualifies:boolean;source:string;text:string};
const unknown=(text='',source=''):DomesticBudget=>({minimum:null,qualifies:false,source,text});
function budgetAmount(value:unknown,source:string):DomesticBudget{
 const text=String(value??'').normalize('NFKC').trim(),raw=text.replace(/(?<=\d)[,，](?=\d{3}(?:\D|$))/g,'').replace(/\s+/g,'').replace(/不低于|不少于|不小于/g,'至少');
 if(!raw||/美元|美金|港币|澳元|澳币|欧元|英镑|日元|韩元|新币|新加坡元|加元|纽元|卢布|卢比|泰铢|迪拉姆|USD|HKD|AUD|EUR|GBP|JPY|KRW|SGD|CAD|NZD|RUB|INR|THB|AED|SAR|[$€£]|平方|㎡|m²|sqft|约|左右|差不多|待定|不确定|面议|以下|以内|不到|不超过|未超过|不高于|低于|小于|少于|至多|最多|最高|[<≤]/i.test(raw+' '+source))return unknown(text,source);
 const amounts=[...raw.matchAll(/(\d+(?:\.\d+)?)\s*(亿(?:元)?|千万(?:元)?|百万(?:元)?|万(?:元)?|千(?:元)?|元|[wWkKmM])?/g)];
 if(!amounts.length||amounts.length>2)return unknown(text,source);
 if(amounts.length===2&&!/^[-—–~～至到]+$/.test(raw.slice(amounts[0].index!+amounts[0][0].length,amounts[1].index)))return unknown(text,source);
 const remainder=raw.replace(/(\d+(?:\.\d+)?)\s*(亿(?:元)?|千万(?:元)?|百万(?:元)?|万(?:元)?|千(?:元)?|元|[wWkKmM])?/g,'').replace(/人民币|RMB|CNY|[¥￥]|(?:项目|投资|客户|总)?预算|金额|总额|至少|起步|起|以上|及|高于|超过|大于|[-—–~～至到:：+>≥=]/gi,'');
 if(remainder)return unknown(text,source);
 const headerUnit=/亿元/.test(source)?'亿':/万元|万人民币/.test(source)?'万':/千元/.test(source)?'千':'元';
 const shared=amounts.find(m=>m[2])?.[2]||headerUnit;
 const factor=(unit:string)=>/^亿/.test(unit)?1e8:/^千万/.test(unit)?1e7:/^百万|^[mM]$/.test(unit)?1e6:/^万|^[wW]$/.test(unit)?1e4:/^千|^[kK]$/.test(unit)?1e3:1;
 const numbers=amounts.map(m=>Number(m[1])*factor(m[2]||(amounts.length===2?shared:headerUnit))),minimum=Math.min(...numbers);
 return Number.isFinite(minimum)&&minimum>=0?{minimum,qualifies:minimum>=DOMESTIC_PRIORITY_BUDGET_CNY,source,text}:unknown(text,source);
}
export function domesticProjectBudget(lead:any):DomesticBudget{
 const detail=sourceRecord(lead?.detail??lead),embedded=sourceRecord(detail['原始内容']);
 for(const record of [detail,embedded]){
  const entries=Object.entries(record).filter(([key,value])=>typeof value!=='object'&&String(value??'').trim()&&(/预算|^(?:project_|investment_|customer_)?budget(?:_cny)?$/i.test(key))&&!/广告|推广|设计费|设计预算|报价|成交|回款|利润/i.test(key));
  if(entries.length){
   const parsed=entries.map(([key,value])=>budgetAmount(value,key));
   const explicit=parsed.filter(p=>/万元|亿元|千元/.test(p.source));
   const values=explicit.length?parsed.filter(p=>!explicit.some(e=>p!==e&&p.text===e.text&&!/万元|亿元|千元/.test(p.source))):parsed;
   if(values.some(v=>v.minimum===null))return unknown(values.map(v=>v.text).join('；'),values.map(v=>v.source).join(' / '));
   const minimum=Math.min(...values.map(v=>v.minimum!));return {minimum,qualifies:minimum>=DOMESTIC_PRIORITY_BUDGET_CNY,source:values.map(v=>v.source).join(' / '),text:[...new Set(values.map(v=>v.text))].join('；')};
  }
 }
 for(const [key,value]of Object.entries(detail)){
  if(typeof value!=='string'||!/项目需求描述|表单内容|原始内容|客户原始消息|原始咨询|需求|requirement|message|briefly_describe/.test(key))continue;
  const text=value.replace(/(?<=\d)[,，](?=\d{3}(?:\D|$))/g,'');
  const matches=[...text.matchAll(/(?:项目|投资|客户|总)?预算(?:金额|总额)?\s*[:：是为]?\s*([^，。；;\n]+)/g)].filter(m=>!/广告|推广|设计费|设计/.test(text.slice(Math.max(0,m.index!-6),m.index)));
  if(matches.length){const values=matches.map(m=>budgetAmount(m[1].split(/电话|微信|联系人|面积/)[0].trim(),key+'中的预算'));if(values.some(v=>v.minimum===null))return unknown(values.map(v=>v.text).join('；'),key);const minimum=Math.min(...values.map(v=>v.minimum!));return {minimum,qualifies:minimum>=DOMESTIC_PRIORITY_BUDGET_CNY,source:key,text:[...new Set(values.map(v=>v.text))].join('；')};}
 }
 return unknown();
}
