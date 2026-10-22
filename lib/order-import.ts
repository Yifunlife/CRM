import {ORDER_STEPS,ORDER_FIELDS,LOGISTICS_FIELDS} from './order-followup';
export const ORDER_IMPORT_LIMIT=500;
export const ORDER_IMPORT_COLUMNS=[
 {key:'project',label:'项目名称',aliases:['项目','工程名称'],required:true},
 {key:'order_number',label:'合同／订单编号',aliases:['合同编号','订单编号','订单号','合同号'],required:true},
 {key:'customer_name',label:'客户名称',aliases:['客户','客户姓名','公司名称']},
 {key:'lead_id',label:'CRM客户ID',aliases:['客户ID','lead_id']},
 {key:'commercial',label:'商务负责人',aliases:['业务员','业务负责人','销售负责人','商务']},
 {key:'logistics',label:'后勤负责人',aliases:['跟单员','跟单人','后勤','跟单负责人']},
 {key:'stage',label:'当前阶段',aliases:['跟单阶段','阶段']},
 {key:'history_note',label:'历史进度说明',aliases:['历史状态','进度说明','备注','项目进展']},
 ...ORDER_FIELDS.map(([key,label])=>({key,label,aliases:[] as string[]})),
 ...LOGISTICS_FIELDS.map(([key,label])=>({key,label,aliases:[] as string[]})),
 {key:'planned_ship',label:'计划发货日期',aliases:['预计发货日期','计划发货时间']},
 {key:'actual_ship',label:'实际发货日期',aliases:['实际发货时间']},
 {key:'eta_port',label:'预计到港日期',aliases:['预计到港时间','ETA']},
 {key:'eta_site',label:'预计到现场日期',aliases:['预计送达日期','预计到客户现场日期']}
] as const;
export function importStage(value:string){
 const text=value.trim();if(!text)return 0;
 if(/^\d+$/.test(text)){const n=Number(text);if(n>=1&&n<=ORDER_STEPS.length)return n-1;}
 const name=text.replace(/^\d+[.、\s]+/,'');return ORDER_STEPS.findIndex(s=>s.name===name);
}
export function importDate(value:string,date1904=false){
 const text=value.trim();if(!text)return '';
 if(/^\d{1,7}(\.\d+)?$/.test(text)){
  const serial=Number(text);if(serial<1||serial>2957000)throw Error('Excel日期值无效，请改为YYYY-MM-DD');
  return new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+Math.floor(serial)*86400000).toISOString().slice(0,10);
 }
 const match=/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?$/.exec(text);
 if(!match)throw Error('日期须为YYYY-MM-DD');
 const result=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
 if(!Number.isFinite(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result)throw Error('日期无效');return result;
}
