import {AllocationError} from './allocation-server';
import {quoteAccount} from './sales-quote-source';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
const origin='https://yifunlife-erp.yifunlife.workers.dev';
export async function executionQuote(db:D1Database,source:D1Database|undefined,u:any,quoteId:string){
 if(u.role==='followup')fail('报价与合同资料由商务或管理人员关联',403);
 if(!source)fail('报价读取连接尚未配置',503);
 const shared=await db.prepare("SELECT q.id FROM crm_sales_quote_links q JOIN crm_sales_projects p ON p.project_id=q.project_id JOIN crm_leads l ON l.id=p.lead_id WHERE l.owner_id=? AND json_extract(q.summary,'$.bridge_shared')=1 AND EXISTS(SELECT 1 FROM json_each(q.summary,'$.versions') v WHERE json_extract(v.value,'$.id')=?)").bind(u.id,quoteId).first();
 const email=shared?null:await quoteAccount(db,source,u);
 const q:any=await source!.prepare('SELECT id,contract_no,project_name,customer_name,created_by,is_finalized,final_amount,final_currency,confirmed_at,voided_at,archived_at,project_status FROM quotation_history WHERE id=?'+(email?' AND created_by=?':'')).bind(quoteId,...(email?[email]:[])).first();
 if(!q)fail('报价不存在或无权读取',404);
 if(!q.is_finalized||q.final_amount==null||q.voided_at||q.archived_at||q.project_status==='lost')fail('请选择已确认成交且当前有效的报价版本');
 const saved:any=await source!.prepare('SELECT id,data_json,created_at FROM quotation_handovers WHERE quotation_id=? ORDER BY rowid DESC LIMIT 1').bind(q.id).first();
 if(!saved)fail('该报价尚无商务交接资料，请先到报价系统补齐并保存');
 const d=JSON.parse(saved.data_json);
 if(d.confirmedAt!==(q.confirmed_at||'')||d.finalAmount!==q.final_amount||d.currency!==(q.final_currency||d.currency)||d.quotationId!==q.id||d.contractNo!==q.contract_no)fail('报价已变化，请商务重新确认交接资料后关联',409);
 return {kind:'quote',quote_id:q.id,handover_id:saved.id,contract_no:q.contract_no,customer:q.customer_name||d.customerName,amount_minor:Math.round(q.final_amount*100),currency:q.final_currency||d.currency,payment_terms:d.paymentTerms||'',delivery_notes:d.deliveryNotes||'',customer_confirmation:d.customerConfirmation||'',supply_scope:(d.items||[]).map((i:any)=>[i.sku,i.name,i.specification,i.quantity,i.unit].filter(x=>x!==undefined&&x!==null&&x!=='').join(' · ')).join('\n'),files:(d.files||[]).map((f:any)=>({id:f.id,name:f.filename,url:origin+'/api/quotation-handover?quotation='+encodeURIComponent(q.id)+'&file='+encodeURIComponent(f.id)})),quote_url:origin+'/?quotationHistory='+encodeURIComponent(q.id),handover_url:origin+'/api/quotation-handover?quotation='+encodeURIComponent(q.id)+'&id='+encodeURIComponent(saved.id),saved_at:saved.created_at};
}
