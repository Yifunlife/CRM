import {customerSource} from './customer-source';

export function sourceRecord(value:any):Record<string,any>{
 if(typeof value==='string'){try{value=JSON.parse(value);}catch{return {};}}
 return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
}

// Social account identity is separate from advertising accounts and allocation
// scope. Only use the original enquiry, never a later repeat.
export function customerOrigin(lead:any,original:any={}){
 const detail=sourceRecord(lead.detail),raw=sourceRecord(original);
 const records=[detail,raw],accounts=new Set<string>();
 const forms=[...new Set(records.flatMap(r=>[r.form_name,r['来源表单'],r._sheet]).filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()))];
 for(const r of records){
  for(const key of ['source_account','来源账号','运营账号'])if(['乐园号','玩具号','工厂号'].includes(r[key]))accounts.add(r[key]);
 }
 for(const form of forms){
  for(const account of ['乐园号','玩具号','工厂号'])if(form.includes(account))accounts.add(account);
 }
 const meta=['meta','fb','facebook','ig','instagram'].includes(String(lead.source||'').trim().toLowerCase());
 const label=(values:Set<string>)=>values.size===1?[...values][0]:meta?'待确认':'—';
 const platform=customerSource({...lead,detail:{...raw,...detail},origin_platform:raw.platform||raw['来源渠道']});
 return {origin_account:label(accounts),origin_form:forms.join('；'),origin_evidence:accounts.size>1?'原始来源记录不一致，待核查':forms.length?'原始表单：'+forms.join('；'):accounts.size?'原始来源账号：'+[...accounts][0]:'原始来源记录未注明',display_source:platform};
}
