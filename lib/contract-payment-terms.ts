import {strFromU8,strToU8} from 'fflate';
const defaults:Record<string,string>={
 'template-1':'设计费以转账方式支付，合同签订后3日内支付100%设计费。',
 'template-2':'1、签订合同后支付50%定金。\n2、生产完成后支付45%发货款，到账后安排发货。\n3、安装完成并验收后支付5%尾款。',
 'template-3':'1、签订合同后支付50%定金。\n2、生产完成后支付45%发货款，到账后安排发货。\n3、安装完成并验收后支付5%尾款。',
 'template-4':'Payment by bank transfer: 100% of the design fee within three (3) business days after signing this Contract.',
 'template-16':'Payment by bank transfer: 100% of the design fee within three (3) business days after signing this Contract.',
 'template-6':'50% deposit within three (3) business days after signing this Contract.\n50% balance upon completion of production, before dispatch.',
 'template-7':'50% deposit within three (3) business days after signing this Contract.\n50% balance upon completion of production, before dispatch.',
 'template-8':'100% paid before the work starts',
 'template-10':'50% deposit and 50% balance before delivery.',
 'template-12':'50% deposit and 50% balance before delivery.',
 'template-14':'50% deposit and 50% balance before delivery.',
 'template-15':'50% deposit and 50% balance before delivery.'
};
export const PAYMENT_MILESTONES={
 signing:{zh:'合同签订后',en:'After signing this Contract'},
 dispatch:{zh:'发货前',en:'Before dispatch'},
 arrival:{zh:'到货后',en:'After arrival of the goods'},
 acceptance:{zh:'验收后',en:'After acceptance'},
 design_confirmation:{zh:'设计方案确认后',en:'After confirmation of the design plan'},
 design_delivery:{zh:'设计成果交付前',en:'Before delivery of the design deliverables'}
};
export type PaymentPlanRow={milestone:keyof typeof PAYMENT_MILESTONES;percent:string};
const designTemplate=(id:string)=>['template-1','template-4','template-16','template-8'].includes(id);
export function paymentPlanRows(id:string,count:number):PaymentPlanRow[]{
 const stages:PaymentPlanRow['milestone'][]=designTemplate(id)?['signing','design_confirmation','design_delivery','acceptance']:['signing','dispatch','arrival','acceptance'];
 const selected=count===1?[stages[0]]:count===2?[stages[0],designTemplate(id)?'design_delivery' as const:'dispatch' as const]:count===3?[stages[0],stages[1],stages[3]]:stages;
 return selected.map(milestone=>({milestone,percent:count===1?'100':''}));
}
export function defaultPaymentPlan(id:string){
 const count=designTemplate(id)?1:['template-2','template-3'].includes(id)?3:2,percents=count===1?['100']:count===3?['50','45','5']:['50','50'];
 return paymentPlanRows(id,count).map((row,i)=>({...row,percent:percents[i]}));
}
export function paymentPlanInvoiceTotal(rows:{quantity:string;unitPrice:string}[]):number|null{
 let total=0;
 for(const row of rows){
  if(!/^\d{1,6}(\.\d{1,3})?$/.test(row.quantity)||Number(row.quantity)<=0||!/^\d{1,9}(\.\d{1,2})?$/.test(row.unitPrice))return null;
  const [quantity,qFraction='']=row.quantity.split('.'),[price,pFraction='']=row.unitPrice.split('.');
  const milli=BigInt(quantity)*BigInt(1000)+BigInt(qFraction.padEnd(3,'0')),cents=BigInt(price)*BigInt(100)+BigInt(pFraction.padEnd(2,'0'));
  total+=Number((milli*cents+BigInt(500))/BigInt(1000));
  if(!Number.isSafeInteger(total)||total>99999999999)return null;
 }
 return total>0?total:null;
}
export function calculatePaymentPlan(raw:unknown,amountMinor:number,currency:string){
 if(raw===undefined)return undefined;
 if(!Array.isArray(raw)||raw.length<1||raw.length>4)throw Error('请选择1至4期付款');
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>99999999999)throw Error('请先填写有效合同金额');
 const rows=raw.map((row:unknown,i:number)=>{
  if(!row||typeof row!=='object')throw Error('请填写第'+(i+1)+'期付款节点和比例');
  const {milestone,percent}=row as Partial<PaymentPlanRow>;
  if(typeof milestone!=='string'||!Object.hasOwn(PAYMENT_MILESTONES,milestone))throw Error('请选择第'+(i+1)+'期付款节点');
  if(typeof percent!=='string'||!/^\d{1,3}(\.\d{1,2})?$/.test(percent)||Number(percent)<=0||Number(percent)>100)throw Error('第'+(i+1)+'期比例须大于0且不超过100%，最多两位小数');
  const [whole,fraction='']=percent.split('.');return {milestone:milestone as PaymentPlanRow['milestone'],percent,basisPoints:Number(whole)*100+Number(fraction.padEnd(2,'0'))};
 });
 if(rows.reduce((sum,row)=>sum+row.basisPoints,0)!==10000)throw Error('各期付款比例合计必须为100%');
 let cumulative=0,allocated=0;
 const payments=rows.map((row,i)=>{
  cumulative+=row.basisPoints;const rounded=Math.round(amountMinor*cumulative/10000),amount=((rounded-allocated)/100).toFixed(2);allocated=rounded;
  return {label:'第'+(i+1)+'期 · '+PAYMENT_MILESTONES[row.milestone].zh+' · '+Number(row.percent)+'%',amount};
 });
 const terms=rows.map((row,i)=>currency==='CNY'?`${i+1}、${PAYMENT_MILESTONES[row.milestone].zh}支付合同总金额的${Number(row.percent)}%，计人民币${payments[i].amount}元。`:`${i+1}. ${PAYMENT_MILESTONES[row.milestone].en}, Party A shall pay ${Number(row.percent)}% of the total contract amount, being ${currency} ${payments[i].amount}.`).join('\n');
 return {terms,payments};
}
export function paymentTermsField(id:string){return {key:'paymentTerms',label:'付款方式',type:'payment-plan',required:true,defaultValue:defaults[id]};}
export function customPaymentTerms(id:string,value:string){return value===defaults[id]?'':value;}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const decode=(s:string)=>s.replace(/&(amp|lt|gt|quot|apos);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[key as 'amp'|'lt'|'gt'|'quot'|'apos']));
export function replaceWordPaymentTerms(id:string,parts:Record<string,Uint8Array>,paragraphs:string[],terms:string){
 if(!terms)return paragraphs;
 const range:Record<string,[string,number]>={
  'template-1':['4.2  设计费',1],'template-2':['1、签定本合同后',3],'template-3':['1、签定本合同后',3],
  'template-4':['Payment shall be made via bank transfer.',1],'template-16':['Payment shall be made via bank transfer.',1],
  'template-6':['4.1 Within three (3) business days',2],'template-7':['4.1 Within three (3) business days',2]
 };
 const [prefix,count]=range[id],start=paragraphs.findIndex(p=>p.startsWith(prefix));
 if(start<0)throw Error('范本付款条款位置缺失');
 const originals=paragraphs.slice(start,start+count),replacement=(id==='template-1'?'4.2  ':'')+terms;
 let replaced=0;
 const xml=strFromU8(parts['word/document.xml']).replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g,p=>{
  const text=decode([...p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join(''));
  if(!originals.includes(text))return p;
  replaced++;if(text!==originals[0])return '';
  const head=p.match(/^<w:p\b[^>]*>/)![0],style=p.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/)?.[0]||'',runStyle=p.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/)?.[0]||'';
  return head+style+'<w:r>'+runStyle+replacement.split('\n').map(escape).map(t=>'<w:t xml:space="preserve">'+t+'</w:t>').join('<w:br/>')+'</w:r></w:p>';
 });
 if(replaced!==count)throw Error('范本付款条款未完整替换，请检查范本');
 parts['word/document.xml']=strToU8(xml);
 return [...paragraphs.slice(0,start),replacement,...paragraphs.slice(start+count)];
}
