import {AllocationError} from './allocation-server';
import {clean,digest,emailKey,now,phoneKey} from './crm';
import {distributeServiceLead} from './service-allocation';
import {enquiryNotification} from './lead-notifications';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
async function matches(db:D1Database,phone:string,email=''){
 const rows=(await db.prepare('SELECT l.id,l.name,l.phone,l.email,l.owner_id,l.review,u.name owner_name,u.active owner_active FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id').all<any>()).results;
 return rows.filter(l=>phoneKey(l.phone)===phone||email&&emailKey(l.email)===email);
}
export async function receiveServiceMessage(db:D1Database,owner:string,m:any){
 if(m.direction!=='in'||m.history||Date.parse(m.created)<Date.now()-86400000)return;
 const peer=phoneKey(m.peer),key='service-'+await digest(owner+':'+peer),at=now();
 const existing=await matches(db,peer);
 const contact:any=await db.prepare('SELECT lead_id FROM crm_service_contacts WHERE id=?').bind(key).first();
 if(contact?.lead_id){const event='service-message:'+await digest(owner+':'+String(m.id));await db.batch([db.prepare("INSERT OR IGNORE INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES(?,?,?,?,'WhatsApp客服','请业务员跟进',?)").bind(event,contact.lead_id,owner,'客服号码收到客户回复：'+clean(m.content,12000),at),enquiryNotification(db,event,contact.lead_id,clean(m.content,1000),at)]);}
 await db.batch([
  db.prepare('INSERT OR IGNORE INTO crm_service_contacts(id,owner_id,peer,first_message,created) VALUES(?,?,?,?,?)').bind(key,owner,peer,clean(m.content,12000),at),
  db.prepare(`INSERT OR IGNORE INTO crm_service_replies(id,owner_id,peer,content,created,updated)
   SELECT ?,?,?,reply,?,? FROM crm_service_settings WHERE owner_id=? AND enabled=1 AND reply<>'' AND changes()>0 AND ?=0`)
   .bind(key,owner,peer,Date.now(),Date.now(),owner,existing.length)
 ]);
}
export async function serviceWorker(db:D1Database,owner:string,body:any,connected:boolean){
 const timestamp=Date.now();
 if(body.result){const r=body.result,c:any=await db.prepare("SELECT * FROM crm_service_replies WHERE id=? AND owner_id=? AND state='running'").bind(String(r.id||''),owner).first();
  if(c){if(!['sent','failed','uncertain'].includes(r.state)||r.state==='sent'&&(!r.message_id||phoneKey(r.peer)!==c.peer))fail('客服发送回执无效');
   await db.prepare("UPDATE crm_service_replies SET state=?,result=?,updated=? WHERE id=? AND owner_id=? AND state='running'").bind(r.state,clean(r.error,300),timestamp,c.id,owner).run();
   if(r.state==='sent'){const provider='linked:'+owner+':'+clean(r.message_id,200);await db.prepare("INSERT OR IGNORE INTO crm_cloud_messages(id,owner_id,phone_id,peer,direction,content,status,provider_id,created) VALUES(?,?,?,?,'out',?,'sent',?,?)").bind('linked-'+await digest(provider),owner,'linked:'+owner,c.peer,c.content,provider,now()).run();}
  }
 }
 await db.prepare("UPDATE crm_service_replies SET state='uncertain',result='发送结果待核查，不会自动重发',updated=? WHERE owner_id=? AND state='running' AND updated<?").bind(timestamp,owner,timestamp-120000).run();
 await db.prepare("UPDATE crm_service_replies SET state='failed',result='自动回复已关闭、客资已处理或消息已过期',updated=? WHERE owner_id=? AND state='queued' AND (created<? OR NOT EXISTS(SELECT 1 FROM crm_service_settings WHERE owner_id=? AND enabled=1) OR EXISTS(SELECT 1 FROM crm_service_contacts c WHERE c.id=crm_service_replies.id AND c.state<>'待录入'))").bind(timestamp,owner,timestamp-60000,owner).run();
 if(!connected||body.result)return null;
 const next:any=await db.prepare("SELECT * FROM crm_service_replies WHERE owner_id=? AND state='queued' ORDER BY created LIMIT 1").bind(owner).first();
 if(!next)return null;
 if((await matches(db,next.peer)).length){await db.prepare("UPDATE crm_service_replies SET state='failed',result='已有CRM客户，不自动接待' WHERE id=? AND state='queued'").bind(next.id).run();return null;}
 const claimed=await db.prepare("UPDATE crm_service_replies SET state='running',updated=? WHERE id=? AND state='queued' RETURNING id").bind(timestamp,next.id).first();
 return claimed?{id:next.id,peer:next.peer,content:next.content}:null;
}
export async function customerServiceEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 if(!path.startsWith('service/'))return undefined;
 if(user.role==='ceo'&&!(path==='service/inbox'&&method==='GET'||path==='service/conversation'&&method==='POST'))fail('CEO仅可查看客服记录',403);
 if(!['admin','ceo'].includes(user.role)||actor.id!==user.id)fail('客服对接仅供管理员本人使用',403);
 if(path==='service/inbox'&&method==='GET'){
  const settings=await db.prepare('SELECT enabled,reply,updated FROM crm_service_settings WHERE owner_id=?').bind(user.id).first();
  const contacts=(await db.prepare(`SELECT c.*,l.name,l.source,l.owner_id assigned_owner,u.name owner_name,r.state reply_state,r.result reply_result,
   (SELECT content FROM crm_cloud_messages m WHERE m.owner_id=c.owner_id AND m.peer=c.peer ORDER BY created DESC LIMIT 1) latest_message
   FROM crm_service_contacts c LEFT JOIN crm_leads l ON l.id=c.lead_id LEFT JOIN crm_users u ON u.id=l.owner_id LEFT JOIN crm_service_replies r ON r.id=c.id WHERE (c.owner_id=? OR ?='ceo') ORDER BY c.created DESC LIMIT 300`).bind(user.id,user.role).all()).results;
  return {settings:settings||{enabled:0,reply:''},contacts};
 }
 if(path==='service/settings'&&method==='POST'){
  const reply=clean(body.reply,4000);if(typeof body.enabled!=='boolean'||body.enabled&&!reply)fail('启用前请填写首次自动回复内容');
  const device:any=await db.prepare('SELECT enabled,status,seen FROM crm_linked_devices WHERE owner_id=?').bind(user.id).first();
  if(body.enabled&&(!device?.enabled||device.status!=='connected'||Date.now()-device.seen>=20000))fail('请先连接客服WhatsApp，再启用自动回复',409);
  await db.prepare('INSERT INTO crm_service_settings(owner_id,enabled,reply,updated) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET enabled=excluded.enabled,reply=excluded.reply,updated=excluded.updated').bind(user.id,body.enabled?1:0,reply,now()).run();return {ok:true};
 }
 const row:any=await db.prepare(`SELECT * FROM crm_service_contacts WHERE id=? AND (owner_id=? OR ?='ceo')`).bind(clean(body.id,100),user.id,user.role).first();if(!row)fail('客服来信不存在',404);
 if(path==='service/conversation'&&method==='POST')return {messages:(await db.prepare('SELECT id,direction,content,status,created FROM crm_cloud_messages WHERE owner_id=? AND peer=? ORDER BY created DESC LIMIT 100').bind(row.owner_id,row.peer).all()).results.reverse(),matches:await matches(db,row.peer)};
 if(path!=='service/register'||method!=='POST')fail('客服操作不存在',404);
 if(row.state==='已分配'||row.state==='已有客户')return {state:row.state,lead_id:row.lead_id};
 if(body.version!==row.version)fail('此条来信已更新，请刷新后重试',409);
 const data={name:clean(body.name,200),email:emailKey(body.email),country:clean(body.country,200),requirement:clean(body.requirement,4000),category:clean(body.category,20)};
 if(!data.name||!data.requirement||!['全案','场景','玩具'].includes(data.category)||data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))fail('请填写客户名称、需求和客资类型，并核对邮箱格式');
 let found=await matches(db,row.peer,data.email);
 const ownLead=row.lead_id&&found.find(l=>l.id===row.lead_id);
 if(found.length>1||found.some(l=>l.review)){await db.prepare("UPDATE crm_service_contacts SET error='联系方式匹配多条客户或待核查资料，请在客户管理核查后重试',payload=? WHERE id=? AND version=?").bind(JSON.stringify(data),row.id,row.version).run();fail('查重存在冲突，未新增或分配，请先核查客户管理中的重复记录',409);}
 if(found.length&&!ownLead){const lead=found[0];
  await db.batch([
   db.prepare("UPDATE crm_service_contacts SET state='已有客户',lead_id=?,payload=?,error='',version=version+1 WHERE id=? AND version=?").bind(lead.id,JSON.stringify(data),row.id,row.version),
   db.prepare("INSERT OR IGNORE INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) SELECT ?,?,?,?,'WhatsApp客服','请原负责人跟进本次需求',? WHERE EXISTS(SELECT 1 FROM crm_service_contacts WHERE id=? AND state='已有客户' AND lead_id=?)").bind('service:'+row.id,lead.id,user.id,'WhatsApp客服再次咨询：'+data.requirement,now(),row.id,lead.id),
   enquiryNotification(db,'service:'+row.id,lead.id,'WhatsApp客服转交：'+data.requirement)
  ]);return {state:'已有客户',lead_id:lead.id,owner_name:lead.owner_name||'负责人待核查'};
 }
 const leadId=row.lead_id||'wa-intake-'+await digest(row.peer),detail=JSON.stringify({'项目需求描述':data.requirement,'客服客资类型':data.category,'客服接待记录':row.id,'首次来信':row.first_message});
 if(!row.lead_id){
  await db.batch([
   db.prepare("INSERT OR IGNORE INTO crm_leads(id,name,phone,email,country,source,channel,business_scope,entered,detail,fingerprint,created) SELECT ?,?,?,?,?,'WhatsApp','WhatsApp客服','whatsapp',?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_service_contacts WHERE id=? AND version=? AND lead_id IS NULL) AND NOT EXISTS(SELECT 1 FROM crm_leads WHERE ?<>'' AND lower(trim(email))=?)").bind(leadId,data.name,row.peer,data.email,data.country,now(),detail,'whatsapp:'+row.peer,now(),row.id,row.version,data.email,data.email),
   db.prepare("UPDATE crm_service_contacts SET state='待分配',lead_id=?,payload=?,error='',version=version+1 WHERE id=? AND version=? AND changes()>0").bind(leadId,JSON.stringify(data),row.id,row.version)
  ]);
 }
 const saved:any=await db.prepare('SELECT * FROM crm_service_contacts WHERE id=?').bind(row.id).first();
 if(!saved?.lead_id)fail('同期出现相同联系方式或记录已更新，请刷新并重新查重',409);
 // Recheck immediately before assignment; never claim an existing customer's ownership.
 found=await matches(db,row.peer,data.email);if(found.length!==1||found[0].id!==saved.lead_id)fail('录入后出现重复资料，客资保留待核查，未分配',409);
 try{
  const savedData=JSON.parse(saved.payload);
  await db.prepare("INSERT OR IGNORE INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES(?,?,?,?,'WhatsApp客服','请业务员联系并跟进需求',?)").bind('service:'+row.id,saved.lead_id,user.id,'客服接待转交｜WhatsApp\n首次来信：'+row.first_message+'\n需求：'+savedData.requirement,now()).run();
  const assigned=await distributeServiceLead(db,saved.lead_id,user.id,savedData.category==='全案');
  if(!assigned?.owner_id)fail('客资已录入，暂无可分配人员，请刷新后重试',409);
  await db.prepare("UPDATE crm_service_contacts SET state='已分配',error='',version=version+1 WHERE id=? AND lead_id=?").bind(row.id,saved.lead_id).run();
  return {state:'已分配',lead_id:saved.lead_id,owner_name:assigned.owner_name};
 }catch(e:any){await db.prepare('UPDATE crm_service_contacts SET error=? WHERE id=?').bind(clean(e.message,300),row.id).run();throw e;}
}
