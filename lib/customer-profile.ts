import {can,canSetManagement,hasCustomerContact} from './crm';
import {boardLeadVisible} from './market-access';

// Preserve own-customer editing and let company maintainers complete imported installation dossiers.
export function canEditCustomerProfile(user:any,lead:any){return can(user,'customers_edit')||user?.role==='management'&&!!user.id&&(lead?.owner_id===user.id||!user.personal_business&&can(user,'customers_all')&&canSetManagement(user)&&isInstallationCustomer(lead)&&boardLeadVisible(user,lead));}
export function isInstallationCustomer(lead:any){const detail=typeof lead?.detail==='string'?JSON.parse(lead.detail||'{}'):lead?.detail||{},source=detail._installation_source;return typeof source?.title==='string'&&Number.isInteger(source.row)&&source.row>0;}
export function installationCustomerWithoutContact(lead:any){return isInstallationCustomer(lead)&&!hasCustomerContact(lead.phone,customerProfile(lead).wechat);}

export const CUSTOMER_PROJECT_STAGES=['客户沟通/客户分级','设计单成交','报价环节','设备单成交','工程下单/施工图','工程安装图','货品装箱运输','安装与指导','售后'];
export const CUSTOMER_PROJECT_STATUSES=['交涉中','进行中','已暂停','已交付','已丢单'];
export const CUSTOMER_FOLLOW_STATUSES=['未安排','今日跟进','本周跟进','等待客户','等待内部','已完成','已逾期'];
export const CUSTOMER_PROFILE_FIELDS=['contractNumber','contact','organization','province','city','wechat','role','customerType','project','stage','projectStatus','amount','currency','closeDate','nextAction','followStatus','lostReason','notes','blocker','followNote','reviewStatus'] as const;
export function customerProfile(lead:any){
 const detail=typeof lead.detail==='string'?JSON.parse(lead.detail||'{}'):lead.detail||{},workbench=detail._workbench||{},saved=detail._customer_profile||{};
 const first=detail._contacts?.[0]||{};
 return {
  contractNumber:saved.contractNumber??customerContractNumber(lead),contact:saved.contact??first.name??lead.name??'',organization:saved.organization??detail['公司名称']??detail.company_name??'',province:saved.province??detail['省份']??'',city:saved.city??detail['城市']??'',wechat:saved.wechat??detail['微信号']??detail.wechat??'',role:saved.role??first.role??detail['客户角色']??detail['what_is_your_role_in_this_project?']??'',
  customerType:saved.customerType??workbench.customerType??detail['客户类型']??'',project:saved.project??workbench.project??detail['项目']??'',stage:String(saved.stage??workbench.stage??detail['本地阶段']??''),projectStatus:saved.projectStatus??workbench.projectStatus??detail['本地项目状态']??'',
  amount:String(saved.amount??workbench.amount??''),currency:saved.currency??'',closeDate:saved.closeDate??workbench.closeDate??'',nextAction:lead.notes?.[0]?.next_step&&(!saved.nextActionAt||lead.notes[0].created>saved.nextActionAt)?lead.notes[0].next_step:saved.nextAction??workbench.nextAction??detail['下一步']??'',followStatus:saved.followStatus??workbench.followStatus??'',lostReason:saved.lostReason??workbench.lostReason??'',notes:saved.notes??workbench.notes??detail['备注']??'',blocker:saved.blocker??'',followNote:saved.followNote??'',reviewStatus:saved.reviewStatus??''
 };
}
export function validateCustomerProfile(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!CUSTOMER_PROFILE_FIELDS.some(f=>f===k)))throw Error('客户档案字段无效');
 const result:Record<string,string>={};
 for(const key of CUSTOMER_PROFILE_FIELDS){
  if(!(key in value))continue;
  if(typeof value[key]!=='string'||value[key].trim().length>(['notes','nextAction','lostReason','followNote'].includes(key)?6000:500))throw Error('客户档案填写内容无效或过长');
  result[key]=value[key].trim();
 }
 if(result.contractNumber&&result.contractNumber.length>200)throw Error('合同号最多200字');
 if(result.stage&&!/^[1-9]$/.test(result.stage))throw Error('请选择有效的项目阶段');
 if(result.projectStatus&&!CUSTOMER_PROJECT_STATUSES.includes(result.projectStatus))throw Error('请选择有效的项目状态');
 if(result.followStatus&&!CUSTOMER_FOLLOW_STATUSES.includes(result.followStatus))throw Error('请选择有效的跟进状态');
 if(result.reviewStatus&&!['待核实','已核实','需要协助'].includes(result.reviewStatus))throw Error('请选择有效的核查状态');
 if(result.currency&&!['CNY','USD','AUD'].includes(result.currency))throw Error('请选择有效币种');
 if(result.amount&&!/^\d{1,10}(\.\d{1,2})?$/.test(result.amount))throw Error('预计金额需为非负数，最多两位小数');
 if(result.closeDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(result.closeDate)||!Number.isFinite(Date.parse(result.closeDate))||new Date(result.closeDate).toISOString().slice(0,10)!==result.closeDate))throw Error('成交时间无效');
 return result;
}

export function customerContractNumber(lead:any){const detail=typeof lead.detail==='string'?JSON.parse(lead.detail||'{}'):lead.detail||{};return [...new Set([detail._customer_profile?.contractNumber,...(lead.deals||[]).filter((deal:any)=>!deal.cancelled).map((deal:any)=>deal.order_number)].map(value=>String(value||'').trim()).filter(Boolean))].join('、');}
