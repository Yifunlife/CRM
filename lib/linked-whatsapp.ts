import {recordCommunication} from './communication-progress';
import {AllocationError} from './allocation-server';
import {clean,digest,now,phoneKey} from './crm';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
const online=(row:any)=>!!row?.enabled&&Date.now()-row.seen<20000;
async function device(db:D1Database,owner:string){return db.prepare('SELECT * FROM crm_linked_devices WHERE owner_id=?').bind(owner).first<any>();}
export async function linkedEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 if(!path.startsWith('linked/'))return undefined;
 if(user.role!=='sales'||actor.id!==user.id)fail('请用本人业务员账号连接WhatsApp',403);
 const row=await device(db,user.id);
 if(path==='linked/status'&&method==='GET')return {enabled:!!row?.enabled,serviceOnline:online(row),state:online(row)?row.status:'offline',active:online(row)&&row.status==='connected',phone:row?.phone||'',qr:online(row)&&row.qr_expires>Date.now()?JSON.parse(row.qr):[],qr_expires:row?.qr_expires||0,error:row?.error||'',synced_count:row?.synced_count||0};
 if(path.startsWith('linked/send-status/')&&method==='GET'){const command:any=await db.prepare('SELECT state FROM crm_linked_commands WHERE id=? AND owner_id=?').bind(user.id+':'+path.slice('linked/send-status/'.length),user.id).first();if(!command)fail('发送记录不存在',404);return {status:command.state};}
 if(!row?.enabled||!online(row))fail('本人扫码连接服务未就绪，请联系管理员启动连接服务',503);
 if(path==='linked/connect'&&method==='POST'){
  if(row.status==='connected')return {ok:true};
  await db.prepare("UPDATE crm_linked_devices SET desired=CASE WHEN status='awaiting_scan' THEN 'reconnect' ELSE 'connect' END,error='' WHERE owner_id=?").bind(user.id).run();return {ok:true};
 }
 if(path==='linked/disconnect'&&method==='POST'){
  await db.prepare("UPDATE crm_linked_devices SET desired='disconnect',status='disconnecting',qr='[]',qr_expires=0 WHERE owner_id=?").bind(user.id).run();return {ok:true};
 }
 if(path==='linked/send'&&method==='POST'){
  const lead:any=await db.prepare('SELECT * FROM crm_leads WHERE id=? AND owner_id=?').bind(String(body.lead_id||''),user.id).first();if(!lead)fail('客户不存在或不属于本人',404);
  const request=String(body.request_id||''),text=clean(body.text,12000),peer=phoneKey(lead.phone);
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(request)||!text||!/^\d{8,15}$/.test(peer))fail('请填写消息，并核对客户完整国际电话号码');
  const key=user.id+':'+request,hash=await digest(JSON.stringify([lead.id,peer,text])),existing:any=await db.prepare('SELECT * FROM crm_linked_commands WHERE id=?').bind(key).first();
  if(existing){if(existing.owner_id!==user.id||existing.request_hash!==hash)fail('请求编号冲突',409);return {status:existing.state};}
  if(row.status!=='connected')fail('请先扫码连接本人WhatsApp',409);
  if(await db.prepare("SELECT id FROM crm_linked_commands WHERE owner_id=? AND lead_id=? AND state IN ('queued','running','uncertain')").bind(user.id,lead.id).first())fail('此客户已有发送正在处理或待核对，请勿重复发送',409);
  const timestamp=Date.now();try{await db.prepare('INSERT INTO crm_linked_commands(id,owner_id,lead_id,peer,content,request_hash,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(key,user.id,lead.id,peer,text,hash,timestamp,timestamp).run();}catch(e){if(String(e).includes('UNIQUE constraint'))fail('已有发送正在处理，请勿重复发送',409);throw e;}return {status:'queued'};
 }
 fail('扫码连接操作不存在',404);
}
export async function linkedWorker(db:D1Database,req:Request,body:any){
 const token=req.headers.get('authorization')?.match(/^Bearer (.{32,200})$/)?.[1];
 const row:any=token?await db.prepare("SELECT d.*,u.active,u.role FROM crm_linked_devices d JOIN crm_users u ON u.id=d.owner_id WHERE d.token_hash=?").bind(await digest(token)).first():null;
 if(!row?.enabled||!row.active||row.role!=='sales')fail('连接服务认证失败',401);
 const owner=row.owner_id,timestamp=Date.now();
 if(body.ack==='reconnect')await db.prepare("UPDATE crm_linked_devices SET desired='connect',qr='[]',qr_expires=0 WHERE owner_id=? AND desired='reconnect'").bind(owner).run();
 if(body.state){
  if(!['offline','awaiting_scan','connecting','connected','error','disconnected'].includes(body.state))fail('连接状态无效');
  const phone=phoneKey(body.phone);if(phone&&!/^\d{8,15}$/.test(phone))fail('本人号码无效');
  if(phone&&await db.prepare('SELECT owner_id FROM crm_linked_devices WHERE phone=? AND owner_id<>?').bind(phone,owner).first())fail('此WhatsApp已连接另一账号，未同步聊天记录',409);
  const qr=Array.isArray(body.qr)?body.qr:[];if(qr.length>200||qr.length&&qr.length!==qr[0]?.length||qr.some((s:any)=>typeof s!=='string'||!/^[01]{20,200}$/.test(s)||s.length!==qr[0].length))fail('二维码无效');
  await db.prepare("UPDATE crm_linked_devices SET status=?,seen=?,phone=COALESCE(NULLIF(?,''),phone),qr=?,qr_expires=?,error=?,desired=CASE WHEN ?='connected' AND desired='connect' THEN 'idle' WHEN ?='disconnected' THEN 'idle' ELSE desired END WHERE owner_id=?").bind(body.state,timestamp,phone,JSON.stringify(qr),qr.length?Math.min(Number(body.qr_expires)||timestamp,timestamp+45000):0,clean(body.error,300),body.state,body.state,owner).run();
 }
 if(body.messages){
  if(!Array.isArray(body.messages)||body.messages.length>100)fail('同步批次过大');
  // Never accept client-supplied owner or lead IDs; match only this device owner's CRM customers.
  const leads=(await db.prepare('SELECT id,phone FROM crm_leads WHERE owner_id=?').bind(owner).all<any>()).results;
  for(const m of body.messages){
   const peer=phoneKey(m.peer),at=new Date(m.created);if(!m.id||!/^\d{8,15}$/.test(peer)||!['in','out'].includes(m.direction)||!Number.isFinite(at.getTime())||at.getTime()>timestamp+300000)fail('消息格式无效');
   const matches=leads.filter(l=>phoneKey(l.phone)===peer),lead=matches.length===1?matches[0].id:null,provider='linked:'+owner+':'+clean(m.id,200),key='linked-'+await digest(provider),content=clean(m.content,12000)||'[非文字消息，请在手机查看附件]',status=m.history?'history':m.direction==='in'?'received':'sent';
   await db.prepare('INSERT OR IGNORE INTO crm_cloud_messages(id,owner_id,phone_id,lead_id,peer,direction,content,status,provider_id,created) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(key,owner,'linked:'+owner,lead,peer,m.direction,content,status,provider,at.toISOString()).run();
   if(lead&&!m.history)await recordCommunication(db,owner,lead,provider,content,m.direction==='in',at.toISOString());
  }
  await db.prepare("UPDATE crm_linked_devices SET synced_count=(SELECT COUNT(*) FROM crm_cloud_messages WHERE owner_id=? AND phone_id=?) WHERE owner_id=?").bind(owner,'linked:'+owner,owner).run();
 }
 if(body.result){
  const r=body.result,command:any=await db.prepare("SELECT * FROM crm_linked_commands WHERE id=? AND owner_id=? AND state='running'").bind(String(r.id||''),owner).first();
  if(command){
   if(!['sent','failed','uncertain'].includes(r.state)||r.state==='sent'&&(!r.message_id||phoneKey(r.peer)!==command.peer))fail('发送回执无效');
   await db.prepare("UPDATE crm_linked_commands SET state=?,result=?,updated=? WHERE id=? AND owner_id=? AND state='running'").bind(r.state,clean(r.error,300),timestamp,command.id,owner).run();
   if(r.state==='sent'){
    const provider='linked:'+owner+':'+clean(r.message_id,200);
    await db.prepare('INSERT OR IGNORE INTO crm_cloud_messages(id,owner_id,phone_id,lead_id,peer,direction,content,status,provider_id,request_hash,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind('linked-'+await digest(provider),owner,'linked:'+owner,command.lead_id,command.peer,'out',command.content,'sent',provider,command.request_hash,now()).run();await recordCommunication(db,owner,command.lead_id,provider,command.content,false,now());
   }
  }
 }
 await db.prepare("UPDATE crm_linked_commands SET state='uncertain',updated=? WHERE owner_id=? AND state='running' AND updated<?").bind(timestamp,owner,timestamp-120000).run();
 await db.prepare("UPDATE crm_linked_commands SET state='failed',result='操作过期，未发送',updated=? WHERE owner_id=? AND state='queued' AND created<?").bind(timestamp,owner,timestamp-60000).run();
 const queued=(await db.prepare("SELECT c.id,c.peer,l.phone,l.owner_id AS current_owner FROM crm_linked_commands c LEFT JOIN crm_leads l ON l.id=c.lead_id WHERE c.owner_id=? AND c.state='queued'").bind(owner).all<any>()).results;
 for(const c of queued)if(c.current_owner!==owner||phoneKey(c.phone)!==c.peer)await db.prepare("UPDATE crm_linked_commands SET state='failed',result='归属或号码已变更，未发送',updated=? WHERE id=? AND owner_id=? AND state='queued'").bind(timestamp,c.id,owner).run();
 const current=await device(db,owner);let command:any=null;
 if(current?.status==='connected'&&current.desired==='idle'&&online(current)&&!body.result){
  const next:any=await db.prepare("SELECT * FROM crm_linked_commands WHERE owner_id=? AND state='queued' ORDER BY created LIMIT 1").bind(owner).first();
  if(next){const claimed=await db.prepare("UPDATE crm_linked_commands SET state='running',updated=? WHERE id=? AND owner_id=? AND state='queued' RETURNING id").bind(timestamp,next.id,owner).first();if(claimed)command={id:next.id,peer:next.peer,content:next.content};}
 }
 return {desired:current?.desired||'idle',command};
}
