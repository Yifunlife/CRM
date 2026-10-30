const technical=new Set(['_profile_revision','_contacts','id','lead_id','ad_id','adset_id','campaign_id','form_id','_sheet','_row','_sales_progress','lead_status','客户池记录','客户池电话键','客户池邮箱键','原始内容']);
const labels:Record<string,string>={created_time:'录入日期',ad_name:'广告名称',adset_name:'广告组',campaign_name:'广告活动',form_name:'来源表单',is_organic:'自然线索',platform:'来源渠道',full_name:'客户名称',work_phone_number:'联系方式',work_email:'邮箱',country:'所在国家/地区',company_name:'公司名称',inbox_url:'收件箱链接','what_is_your_role_in_this_project?':'客户角色','planning_to_invest_within_6_months?':'计划半年内投资','what_type_of_project_are_you_planning?':'项目类型','which_method_would_you_prefer_to_be_contacted_by?':'偏好联系方式',your_planned_investment_budget:'投资预算',briefly_describe_your_project_needs:'项目需求描述'};
export function businessDetail(raw:Record<string,unknown>={}){
 const result:Record<string,string>={};
 for(const [key,value] of Object.entries(raw)){
  if(technical.has(key)||value===null||value===undefined||typeof value==='object')continue;
  const label=labels[key]||key.replace(/_/g,' '),text=String(value).trim();if(!text)continue;
  if(!result[label]||key===label)result[label]=text;
 }
 return result;
}
export function customerNoteContent(note:{method?:string;content?:string}){
 const text=note.content||'';
 if(note.method!=='表单咨询'||!/^表单(?:首次询问|再次询问)｜提交时间：/.test(text))return text;
 const marker='\n原始内容：',index=text.lastIndexOf(marker);if(index<0)return text;
 try{const raw=JSON.parse(text.slice(index+marker.length));if(raw&&typeof raw==='object'&&!Array.isArray(raw))return text.slice(0,index);}catch{}
 return text;
}
