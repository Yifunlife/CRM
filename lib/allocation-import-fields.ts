import type {Grid} from './import-grid';

export const ALLOCATION_IMPORT_FIELDS:Record<string,string[]>={'客户名称':['用户名','姓名','name','full_name'],'联系方式':['电话','phone','phone_number','work_phone_number'],'邮箱':['email','work_email'],'微信号':['微信','wechat','wechat_id'],'省份':['province'],'城市':['city'],'投资预算':['项目预算','客户预算','预算','project_budget','investment_budget','budget'],'客户等级':['等级','grade'],'所在国家/地区':['国家','country'],'分配业务员':['负责人','业务员','owner'],'客资市场':['业务范围','内贸/外贸','market'],'来源平台':['platform'],'来源账号':['source_account'],'项目需求描述':['留言详情','需求','requirement'],'项目类型':['客资类型','type'],'录入日期':['日期','created_time']};
export function allocationImportMapping(headers:string[]){
 return Object.fromEntries(Object.entries(ALLOCATION_IMPORT_FIELDS).map(([name,aliases])=>[name,[name,...aliases].map(alias=>headers.find(h=>h.trim()===alias)).find(h=>h!==undefined)||'']));
}
export function allocationImportRows(grid:Grid,mapping:Record<string,string>){
 return grid.rows.map(row=>({...Object.fromEntries(grid.headers.map((h,i)=>[h,row[i]||''])),...Object.fromEntries(Object.keys(ALLOCATION_IMPORT_FIELDS).filter(k=>mapping[k]).map(k=>[k,row[grid.headers.indexOf(mapping[k])]||'']))}));
}
