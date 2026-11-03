import {AllocationError} from './allocation-server';
export async function ensureCustomerCode(db:D1Database,lead:any,desktopId=''){
 const existing:any=await db.prepare('SELECT code FROM crm_customer_codes WHERE lead_id=?').bind(lead.id).first();if(existing)return existing.code;
 const detail=typeof lead.detail==='string'?JSON.parse(lead.detail):lead.detail||{};
 const saved=detail._customer_code||(/^[A-Z]{2}\d{8}(?:-\d+)?$/.test(desktopId)?desktopId:'');
 const stamp=Date.parse(lead.created);if(!Number.isFinite(stamp))throw new AllocationError('建档日期待核对，未生成编号');
 const country=/^[A-Z]{2}$/.test(lead.country)?lead.country:'XX',date=new Date(stamp).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}).replaceAll('-',''),prefix=country+date;
 for(let attempt=0;attempt<20;attempt++){
  const rows=(await db.prepare('SELECT code FROM crm_customer_codes WHERE code=? OR code LIKE ?').bind(prefix,prefix+'-%').all<any>()).results;
  const highest=Math.max(0,...rows.map((r:any)=>r.code===prefix?1:Number(r.code.slice(prefix.length+1))||0));const code=saved||(highest?prefix+'-'+(highest+1):prefix);
  await db.prepare('INSERT OR IGNORE INTO crm_customer_codes(lead_id,code) SELECT id,? FROM crm_leads WHERE id=? AND owner_id=?').bind(code,lead.id,lead.owner_id).run();
  const found:any=await db.prepare('SELECT code FROM crm_customer_codes WHERE lead_id=?').bind(lead.id).first();
  if(found){await db.prepare("UPDATE crm_leads SET detail=json_set(detail,'$._customer_code',?) WHERE id=? AND owner_id=?").bind(found.code,lead.id,lead.owner_id).run();return found.code;}
  if(saved)throw new AllocationError('原客户编号冲突，未覆盖');
 }
 throw new AllocationError('客户编号正在分配，请重试');
}
