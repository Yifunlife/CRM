import {customerOrigin,sourceRecord} from './customer-origin';
import {reportAcquiredDay} from './report-acquired-day';
export function originalTimeLabel(input:any){
 const raw=typeof input==='string'?input.trim():'';
 const day=reportAcquiredDay(raw);
 if(!day)return '';
 if(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(raw))return day+'（仅记录日期）';
 return new Date(raw).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）';
}
export function customerInquiry(lead:any,original:any={}){
 const detail=sourceRecord(lead.detail),pool=lead.intake,payload=pool?.payload||{};
 const raw=sourceRecord(pool?.raw||original),embedded=sourceRecord(detail['原始内容']);
 const records=[raw,embedded,...(pool?[payload]:[detail])];
 const candidates=[...records.flatMap(r=>[r.created_time,r['首次表单时间'],r['原始咨询时间'],r['录入日期']]),...(!pool?[lead.entered]:[])];
 const time=candidates.find(v=>originalTimeLabel(v))||'';
 const text=(v:any)=>typeof v==='string'&&v.trim()&&!['待补充','需求待补充','待确认'].includes(v.trim())?v.trim():'';
 let content='';
 for(const r of records){content=['客户原始消息','原始咨询','原始消息','message','briefly_describe_your_project_needs','项目需求描述','需求','requirement'].map(k=>text(r[k])).find(Boolean)||'';if(content)break;}
 if(!content){
  const answers=[['项目类型',['项目类型','what_type_of_project_are_you_planning?']],['客户身份',['客户身份','what_is_your_role_in_this_project?']],['投资预算',['投资预算']],['投资计划',['6个月内投资计划']]] as const;
  content=answers.map(([label,keys])=>{const answer=records.flatMap(r=>keys.map(k=>text(r[k]))).find(Boolean);return answer?label+'：'+answer:'';}).filter(Boolean).join('\n');
 }
 if(!content&&pool?.raw&&!Object.keys(raw).length)content=pool.raw;
 if(!content&&detail['原始内容']&&!Object.keys(embedded).length)content=text(detail['原始内容']);
 const origin=customerOrigin({...lead,detail:{...payload,...detail}},raw);
 return {time,platform:origin.display_source,account:origin.origin_account,content};
}
