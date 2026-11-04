import {digest} from './crm';
import {canEditCustomerProfile} from './customer-profile';
import {AllocationError} from './allocation-server';
const kind='客户沟通重点';
async function sourceRevision(db:D1Database,lead:any){const note:any=await db.prepare('SELECT id FROM crm_notes WHERE lead_id=? ORDER BY created DESC,rowid DESC LIMIT 1').bind(lead.id).first();return JSON.stringify([lead.last_contact||'',note?.id||'']);}
export async function readManualCommunication(db:D1Database,lead:any){
 const row:any=await db.prepare('SELECT e.id,e.payload,u.name AS author FROM crm_sales_events e LEFT JOIN crm_users u ON u.id=e.created_by WHERE e.lead_id=? AND e.kind=? ORDER BY e.created DESC,e.rowid DESC LIMIT 1').bind(lead.id,kind).first();
 if(!row)return null;const data=JSON.parse(row.payload);return {...data,revision:row.id,author:row.author,stale:data.source_revision!==await sourceRevision(db,lead)};
}
export async function saveManualCommunication(db:D1Database,user:any,actor:any,lead:any,body:any){
 if(!canEditCustomerProfile(user,lead))throw new AllocationError('没有客户沟通重点维护权限',403);
 const fields:Record<string,string>={};for(const key of ['customerNeeds','confirmedFacts','pendingItems','nextAction']){if(typeof body.fields?.[key]!=='string'||!body.fields[key].trim()||body.fields[key].length>800)throw new AllocationError('请填写四项沟通重点，每项最多800字');fields[key]=body.fields[key].trim();}
 if(typeof body.revision!=='string'||typeof body.request_id!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(body.request_id))throw new AllocationError('保存请求无效，请刷新后重试');
 const id='manual-analysis-'+await digest(actor.id+':'+body.request_id),existing:any=await db.prepare('SELECT lead_id,payload FROM crm_sales_events WHERE id=?').bind(id).first();
 if(existing){const old=JSON.parse(existing.payload);if(existing.lead_id!==lead.id||JSON.stringify(old.fields)!==JSON.stringify(fields)||old.base_revision!==body.revision)throw new AllocationError('保存请求编号已被使用',409);return {id};}
 const at=new Date().toISOString(),payload=JSON.stringify({fields,source:'手动填写',generated_at:at,source_revision:await sourceRevision(db,lead),base_revision:body.revision});
 const result=await db.prepare("INSERT INTO crm_sales_events(id,kind,payload,lead_id,occurred_at,created,created_by) SELECT ?,?,?,?,?,?,? WHERE COALESCE((SELECT id FROM crm_sales_events WHERE lead_id=? AND kind=? ORDER BY created DESC,rowid DESC LIMIT 1),'')=? AND EXISTS(SELECT 1 FROM crm_leads WHERE id=? AND owner_id IS ?)").bind(id,kind,payload,lead.id,at,at,actor.id,lead.id,kind,body.revision,lead.id,lead.owner_id).run();
 if(!result.meta.changes)throw new AllocationError('沟通重点或客户归属已变化，请取消修改、刷新后再保存',409);return {id};
}
