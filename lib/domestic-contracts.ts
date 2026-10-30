import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {domesticContractAssets} from './domestic-contract-assets';
export type ContractField={key:string;label:string;type?:string;required?:boolean;options?:string[]};
const common:ContractField[]=[{key:'contractNo',label:'合同编号',required:true},{key:'signDate',label:'签订日期',type:'date',required:true},{key:'projectName',label:'项目名称',required:true},{key:'projectAddress',label:'项目地址',required:true},{key:'customerName',label:'甲方名称 / 姓名',required:true},{key:'customerAddress',label:'甲方通讯地址',required:true},{key:'customerAgent',label:'甲方签约人 / 代理人',required:true},{key:'customerPhone',label:'甲方电话',required:true},{key:'sellerAgent',label:'乙方签约人 / 联系人',required:true},{key:'sellerPhone',label:'乙方电话',required:true},{key:'amount',label:'合同总金额（人民币元）',type:'number',required:true},{key:'days',label:'周期天数',type:'number',required:true}];
export function contractFields(id:string):ContractField[]{return [...common,...(id==='template-1'?[{key:'spaceType',label:'空间类型',options:['室内','室外'],required:true},{key:'designScope',label:'设计范围',required:true},...['materialDate','layoutDate','effectDate','listDate'].map((key,i)=>({key,label:['甲方DWG资料提交日期','平面布局方案提交日期','全景效果图提交日期','设备清单提交日期'][i],type:'date',required:true}))]:[{key:'customerId',label:'甲方身份证号（适用时填写）'},{key:'customerEmail',label:'甲方邮箱（公对公）',type:'email'},{key:'includedFees',label:'报价包含费用',required:true},{key:'freightParty',label:'运费承担方',options:['甲方','乙方'],required:true}])].filter(f=>id!=='template-3'||f.key!=='customerEmail');}
export function domesticTemplate(id:string){return domesticContractAssets.find(t=>t.id===id);}
export function rmbUpper(cents:number){
 const digits='零壹贰叁肆伍陆柒捌玖',units=['','拾','佰','仟'];
 const group=(n:number)=>{let s='',zero=false;for(let p=3;p>=0;p--){const d=Math.floor(n/10**p)%10;if(d){if(zero)s+='零';s+=digits[d]+units[p];zero=false;}else if(s)zero=true;}return s;};
 let n=Math.floor(cents/100),whole='',zero=false;
 for(const [base,suffix] of [[100000000,'亿'],[10000,'万'],[1,'']] as const){const g=Math.floor(n/base);n%=base;if(g){if(whole&&(zero||g<1000))whole+='零';whole+=group(g)+suffix;zero=false;}else if(whole)zero=true;}
 const j=Math.floor(cents%100/10),f=cents%10;
 return (whole||'零')+'元'+(!j&&!f?'整':(j?digits[j]+'角':(whole&&f?'零':''))+(f?digits[f]+'分':''));
}
const escapeXml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function generateDomesticContract(id:string,input:Record<string,unknown>){
 const template=domesticTemplate(id);if(!template)throw new Error('请选择内贸合同范本');
 const values:Record<string,string>={};
 for(const field of contractFields(id)){
  const raw=input[field.key];if(raw!==undefined&&typeof raw!=='string')throw new Error('填写内容格式不正确');
  const value=String(raw||'').trim();if(field.required&&!value)throw new Error('请填写'+field.label);
  if(value.length>300||/[\x00-\x1f{}]/.test(value))throw new Error(field.label+'内容过长或含无效字符');
  if(field.options&&value&&!field.options.includes(value))throw new Error('请选择'+field.label);
  if(field.type==='date'&&value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw new Error(field.label+'格式不正确');
  values[field.key]=value||'________';
 }
 if(!/^\d{1,9}(\.\d{1,2})?$/.test(values.amount))throw new Error('金额须大于零，最多两位小数，且小于十亿元');
 const [yuan,fraction='']=values.amount.split('.'),cents=Number(yuan)*100+Number(fraction.padEnd(2,'0'));if(cents<=0)throw new Error('合同金额须大于零');
 if(!/^\d{1,4}$/.test(values.days)||Number(values.days)<1)throw new Error('周期须为1至9999之间的整数天数');
 values.amount=(cents/100).toFixed(2);values.amountUpper=rmbUpper(cents);
 const deposit=Math.round(cents*50/100),shipment=Math.round(cents*45/100),balance=cents-deposit-shipment;
 for(const [key,value] of [['deposit',deposit],['shipment',shipment],['balance',balance]] as const){values[key]=(value/100).toFixed(2);values[key+'Upper']=rmbUpper(value);}
 const fill=(s:string,xml=false)=>s.replace(/\{\{(\w+)\}\}/g,(_,key)=>xml?escapeXml(values[key]||'________'):values[key]||'________');
 const parts=unzipSync(Uint8Array.from(atob(template.data),c=>c.charCodeAt(0)));
 for(const name of Object.keys(parts))if(name.startsWith('word/')&&name.endsWith('.xml'))parts[name]=strToU8(fill(strFromU8(parts[name]),true));
 const binary=zipSync(parts);let data='';for(let start=0;start<binary.length;start+=8192)data+=String.fromCharCode(...binary.subarray(start,start+8192));
 return {paragraphs:template.paragraphs.map(p=>fill(p)),data:btoa(data),name:(values.contractNo+'_'+values.projectName+'_'+(id==='template-1'?'设计合同':'设备合同')).replace(/[\\/:*?"<>|]/g,'_')+'.docx',amount:values.amount,amountUpper:values.amountUpper,payments:id==='template-1'?[{label:'签订后3日内 · 100%',amount:values.amount}]:[{label:'定金 · 50%',amount:values.deposit},{label:'发货款 · 45%',amount:values.shipment},{label:'验收尾款 · 5%',amount:values.balance}]};
}
