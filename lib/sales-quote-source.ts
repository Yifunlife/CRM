import {AllocationError} from './allocation-server';
import {can} from './crm';
import {quoteCommercialAmount} from './sales-suite';
export const quoteLeadership=(u:any)=>['admin','ceo','management'].includes(u.role)&&can(u,'customers_all');
const key=(q:any)=>q.lineage_id||JSON.stringify([q.created_by,String(q.contract_no).replace(/-R\d+$/i,''),q.project_name]);
const metadata='id,contract_no,project_name,created_by,generated_at,lineage_id,is_finalized,archived_at,final_amount,final_currency,confirmed_at,voided_at,project_status,customer_name,quote_valid_until';
export async function quoteAccount(db:D1Database,source:D1Database|undefined,user:any){
 if(!source)throw new AllocationError('报价系统读取连接尚未配置',503);
 if(quoteLeadership(user))return null;
 const link:any=await db.prepare('SELECT quote_email FROM crm_sales_account_links WHERE user_id=?').bind(user.id).first();
 if(!link)throw new AllocationError('请管理员在报价与协作中核实并关联你的报价账号',403);
 const account:any=await source.prepare("SELECT email FROM app_users WHERE email=? AND status='active'").bind(link.quote_email).first();
 if(!account)throw new AllocationError('关联的报价账号已停用或不存在，请管理员核查',403);return account.email;
}
export async function quoteCatalogue(db:D1Database,source:D1Database|undefined,user:any,search='',offset=0){
 const email=await quoteAccount(db,source,user),q='%'+search+'%',where=(email?'created_by=? AND ':'')+'(contract_no LIKE ? OR project_name LIKE ? OR customer_name LIKE ?)';
 const rows=(await source!.prepare(`SELECT ${metadata} FROM quotation_history WHERE ${where} ORDER BY generated_at DESC,id DESC LIMIT 51 OFFSET ?`).bind(...(email?[email]:[]),q,q,q,offset).all<any>()).results;
 return {rows:rows.slice(0,50).map(q=>({...q,source_key:key(q),is_finalized:!!q.is_finalized})),has_more:rows.length>50,offset};
}
export async function quoteSnapshot(db:D1Database,source:D1Database|undefined,user:any,quoteId:string){
 const email=await quoteAccount(db,source,user);
 const seed:any=await source!.prepare(`SELECT ${metadata} FROM quotation_history WHERE id=?`+(email?' AND created_by=?':'')).bind(quoteId,...(email?[email]:[])).first();
 if(!seed)throw new AllocationError('报价不存在或当前账号无权读取',404);
 const family=seed.lineage_id?'lineage_id=?':'created_by=? AND project_name=? AND (lineage_id IS NULL OR lineage_id=\'\')';
 const versions=(await source!.prepare(`SELECT ${metadata} FROM quotation_history WHERE ${family}`+(email?' AND created_by=?':'')+' ORDER BY generated_at DESC,id DESC LIMIT 201').bind(...(seed.lineage_id?[seed.lineage_id]:[seed.created_by,seed.project_name]),...(email?[email]:[])).all<any>()).results.filter(q=>key(q)===key(seed));
 if(versions.length>200)throw new AllocationError('报价版本过多，请联系管理员核查',409);
 const valid=versions.filter(q=>!q.voided_at&&!q.archived_at),current=valid.find(q=>q.id===seed.id);
 let commercial={amount_minor:null as number|null,currency:seed.final_currency||'USD'};
 if(current){const raw:any=await source!.prepare('SELECT snapshot_json FROM quotation_history WHERE id=?').bind(current.id).first();commercial=quoteCommercialAmount(raw?.snapshot_json);if(current.is_finalized&&Number.isFinite(current.final_amount)){commercial.amount_minor=Math.round(current.final_amount*100);commercial.currency=current.final_currency||commercial.currency;}}
 return {source_key:key(seed),quote_id:seed.id,source_owner:seed.created_by,current_id:current?.id||'',contract_no:current?.contract_no||seed.contract_no,project_name:seed.project_name,customer_name:seed.customer_name,current_status:current?.project_status||'unavailable',available:!!current&&current.project_status!=='lost',...commercial,confirmed_at:current?.confirmed_at||'',quote_valid_until:current?.quote_valid_until||'',versions:versions.map(q=>({id:q.id,contract_no:q.contract_no,generated_at:q.generated_at,is_finalized:!!q.is_finalized,voided_at:q.voided_at,archived_at:q.archived_at,project_status:q.project_status})),origin:'https://yifunlife-erp.yifunlife.workers.dev'};
}
