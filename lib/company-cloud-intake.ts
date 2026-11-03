import {recordCommunication} from './communication-progress';
import {AllocationError} from './allocation-server';
import {clean,digest,now,phoneKey} from './crm';
import {distributeServiceLead} from './service-allocation';

async function matches(db:D1Database,peer:string){
 const rows=(await db.prepare('SELECT l.id,l.phone,l.owner_id,l.original_owner,l.review,l.detail,l.fingerprint,u.active owner_active FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id').all<any>()).results;
 return rows.filter(l=>phoneKey(l.phone)===peer);
}

// Only live inbound messages on an administrator's company connection enter this flow.
// Personal numbers and historical imports keep their existing handling.
export async function receiveCompanyCloudMessage(db:D1Database,m:any,name=''){
 if(m.direction!=='in'||m.status!=='received'||!/^\d{8,15}$/.test(m.peer))return;
 const connection=await db.prepare("SELECT c.owner_id FROM crm_cloud_connections c JOIN crm_users u ON u.id=c.owner_id WHERE c.owner_id=? AND c.phone_id=? AND c.active=1 AND u.active=1 AND u.role='admin'").bind(m.owner_id,m.phone_id).first();
 if(!connection)return;
 const key='service-'+await digest(m.owner_id+':'+m.peer),leadId='wa-intake-'+await digest(m.peer),at=now();
 await db.prepare('INSERT OR IGNORE INTO crm_service_contacts(id,owner_id,peer,first_message,created) VALUES(?,?,?,?,?)').bind(key,m.owner_id,m.peer,m.content,at).run();
 const hold=async(error:string)=>{await db.prepare("UPDATE crm_service_contacts SET state='待核查',error=?,version=version+1 WHERE id=?").bind(error,key).run();};
 let found=await matches(db,m.peer);
 if(found.length>1||found.some(l=>l.review)){await hold('手机号匹配多条客户或待核查资料，请核查后处理；未新增或改变归属');return;}
 if(!found.length){
  const contact:any=await db.prepare('SELECT first_message FROM crm_service_contacts WHERE id=?').bind(key).first();
  const payload={name:clean(name,200)||'WhatsApp客户 '+m.peer,requirement:contact.first_message,category:'',country:'',email:'',cloud_intake:true};
  const detail=JSON.stringify({'项目需求描述':contact.first_message,'客服接待记录':key,'首次来信':contact.first_message,'自动接入来源':'WhatsApp Cloud API','资料补充状态':'姓名、国家及需求类型待核实'});
  await db.batch([
   db.prepare("INSERT OR IGNORE INTO crm_leads(id,name,phone,source,channel,business_scope,entered,status,detail,fingerprint,created) VALUES(?,?,?,'WhatsApp','WhatsApp Cloud API','whatsapp',?,'正在沟通',?,?,?)").bind(leadId,payload.name,m.peer,m.created,detail,'whatsapp:'+m.peer,at),
   db.prepare("UPDATE crm_service_contacts SET state='待分配',lead_id=?,payload=?,error='',version=version+1 WHERE id=? AND EXISTS(SELECT 1 FROM crm_leads WHERE id=? AND fingerprint=?)").bind(leadId,JSON.stringify(payload),key,leadId,'whatsapp:'+m.peer)
  ]);
  found=await matches(db,m.peer);
 }
 // A concurrent import can introduce a contact conflict. Do not assign either record.
 if(found.length!==1||found[0].review){await hold('联系方式出现冲突，资料已保留待核查；未改变归属');return;}
 let lead=found[0];
 const createdHere=lead.id===leadId&&lead.fingerprint==='whatsapp:'+m.peer&&JSON.parse(lead.detail||'{}')['自动接入来源']==='WhatsApp Cloud API';
 if(!lead.owner_id&&createdHere&&!lead.original_owner){
  await db.prepare("UPDATE crm_service_contacts SET state='待分配',lead_id=?,error='' WHERE id=?").bind(lead.id,key).run();
  try{await distributeServiceLead(db,lead.id,m.owner_id,false);}catch(e){
   if(!(e instanceof AllocationError))throw e;
   await db.prepare('UPDATE crm_service_contacts SET error=? WHERE id=?').bind(clean(e.message,300),key).run();return;
  }
  lead=(await matches(db,m.peer))[0];
 }
 if(!lead?.owner_id||!lead.owner_active){await hold('已有客资暂无有效负责人，请管理员核查；未重新分配');return;}
 await db.prepare("UPDATE crm_cloud_messages SET lead_id=? WHERE owner_id=? AND phone_id=? AND peer=? AND direction='in' AND status='received' AND (lead_id IS NULL OR lead_id=?)").bind(lead.id,m.owner_id,m.phone_id,m.peer,lead.id).run();
 const unread=(await db.prepare(`SELECT m.id,m.content,m.created FROM crm_cloud_messages m
  WHERE m.owner_id=? AND m.phone_id=? AND m.peer=? AND m.lead_id=? AND m.direction='in' AND m.status='received'
  AND NOT EXISTS(SELECT 1 FROM crm_notes n WHERE n.id='cloud-company:'||m.id) ORDER BY m.created,m.id`).bind(m.owner_id,m.phone_id,m.peer,lead.id).all<any>()).results;
 for(const message of unread)await recordCommunication(db,lead.owner_id,lead.id,'company-cloud:'+message.id,'公司WhatsApp来信：'+message.content,true,message.created,'cloud-company:'+message.id);
 const state=createdHere?'已分配':'已有客户';
 await db.batch([
  db.prepare("UPDATE crm_service_contacts SET state=?,lead_id=?,error='',version=version+1 WHERE id=?").bind(state,lead.id,key),
  db.prepare(`INSERT OR IGNORE INTO crm_lead_notifications(id,dedupe_key,lead_id,recipient_id,title,content,created)
   SELECT lower(hex(randomblob(16))),'cloud-company:'||m.id,m.lead_id,l.owner_id,'WhatsApp客户来信：'||l.name,m.content,m.created
   FROM crm_cloud_messages m JOIN crm_leads l ON l.id=m.lead_id
   WHERE m.owner_id=? AND m.phone_id=? AND m.peer=? AND m.lead_id=? AND m.direction='in' AND m.status='received'`).bind(m.owner_id,m.phone_id,m.peer,lead.id)
 ]);
}

export async function retryCompanyCloudIntake(db:D1Database){
 const pending=(await db.prepare(`SELECT m.* FROM crm_service_contacts s JOIN crm_cloud_connections c ON c.owner_id=s.owner_id
  JOIN crm_users u ON u.id=c.owner_id JOIN crm_cloud_messages m ON m.id=(SELECT x.id FROM crm_cloud_messages x
   WHERE x.owner_id=s.owner_id AND x.phone_id=c.phone_id AND x.peer=s.peer AND x.direction='in' AND x.status='received' ORDER BY x.created DESC LIMIT 1)
  WHERE s.state='待分配' AND c.active=1 AND u.active=1 AND u.role='admin' ORDER BY s.created LIMIT 100`).all<any>()).results;
 for(const m of pending)await receiveCompanyCloudMessage(db,m);
}
