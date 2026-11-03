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
export function paymentTermsField(id:string){return {key:'paymentTerms',label:'付款方式（可手动修改）',type:'textarea',required:true,defaultValue:defaults[id]};}
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
