import {AllocationError} from './allocation-server';
import {digest,now,can} from './crm';
import {linkedEndpoint} from './linked-whatsapp';
export async function communicationConnection(db:D1Database,user:any,actor:any,path:string,method:string,body:any,url:URL){
 if(!path.startsWith('communication/'))return undefined;
 if(user.role!=='sales'||user.id!==actor.id||!['sales','ceo','management'].includes(actor.role))throw new AllocationError('请在本人的业务工作台配置连接',403);
 const owner:any=await db.prepare('SELECT id,username,name,role,active FROM crm_users WHERE id=?').bind(actor.id).first();
 if(!owner?.active||!['sales','ceo','management'].includes(owner.role))throw new AllocationError('账号不可连接',403);
 const snapshot=await db.prepare('SELECT owner_id FROM crm_workbench_snapshots WHERE owner_id=?').bind(owner.id).first();
 if(owner.role==='management'&&!snapshot)throw new AllocationError('此管理账号尚未开通本人业务工作台',403);
 if(body.owner_id&&body.owner_id!==owner.id)throw new AllocationError('只能配置本人账号',403);
 const desktop:any=await db.prepare('SELECT token_hash,seen FROM crm_workbench_bridge WHERE owner_id=?').bind(owner.id).first();
 const linked:any=await linkedEndpoint(db,user,actor,'linked/status','GET',{});
 const official:any=await db.prepare('SELECT active,display_phone,sync_status FROM crm_cloud_connections WHERE owner_id=?').bind(owner.id).first();
 if(path==='communication/connection'&&method==='GET'){
  const preferred:any=await db.prepare('SELECT mode FROM crm_communication_connections WHERE owner_id=?').bind(owner.id).first();
  const progress:any=await db.prepare('SELECT COUNT(*) customers,COALESCE(SUM(complete),0) completed FROM crm_workbench_history_progress WHERE owner_id=?').bind(owner.id).first();
  const messages:any=await db.prepare('SELECT COUNT(*) messages FROM crm_workbench_history WHERE owner_id=?').bind(owner.id).first();
  return {mode:preferred?.mode||'',desktop:{configured:!!desktop,online:!!desktop&&Date.now()-desktop.seen<30000,hasArchive:!!snapshot,history:{...progress,...messages}},whatsapp:{...linked,official:official||null}};
 }
 if(path==='communication/connection'&&method==='POST'){
  if(!['desktop','whatsapp'].includes(body.mode))throw new AllocationError('请选择工作台或WhatsApp');
  if(body.mode==='desktop'&&!snapshot)throw new AllocationError('请先在原工作台完成连接，等待资料同步后再进入',409);
  if(body.mode==='whatsapp'&&!linked.active&&!linked.phone&&!official?.display_phone)throw new AllocationError('请先完成本人WhatsApp连接',409);
  await db.prepare('INSERT INTO crm_communication_connections(owner_id,mode,updated) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET mode=excluded.mode,updated=excluded.updated').bind(owner.id,body.mode,now()).run();return {ok:true,mode:body.mode};
 }
 if(path==='communication/desktop-config'&&method==='POST'){
  if(!can(user,'customers_edit'))throw new AllocationError('此账号未开放客户资料写入，不能生成工作台写入连接',403);
  if(!/^[a-f0-9]{96}$/.test(body.device_token||''))throw new AllocationError('连接配置无效，请重新生成');
  const hash=await digest(body.device_token),same=desktop?.token_hash===hash;
  if(desktop&&!same&&body.replace!==true)throw new AllocationError('已配置原工作台；需要更换时，请使用“更换连接配置”',409);
  if(!same){
   if(desktop)await db.batch([db.prepare("UPDATE crm_workbench_commands SET state='cancelled',updated=? WHERE owner_id=? AND state='queued'").bind(Date.now(),owner.id),db.prepare("UPDATE crm_workbench_bridge SET token_hash=?,created_by=?,seen=0,status='{}' WHERE owner_id=?").bind(hash,owner.id,owner.id)]);
   else await db.prepare('INSERT OR IGNORE INTO crm_workbench_bridge(owner_id,token_hash,created_by) VALUES(?,?,?)').bind(owner.id,hash,owner.id).run();
   const current:any=await db.prepare('SELECT token_hash FROM crm_workbench_bridge WHERE owner_id=?').bind(owner.id).first();if(current.token_hash!==hash)throw new AllocationError('另一处已生成连接配置，请使用已下载的配置',409);
  }
  return {origin:url.origin,owner_id:owner.id,username:owner.username,name:owner.name,token:body.device_token,protocol:2,replace_existing:body.replace===true};
 }
 if(path==='communication/whatsapp-connect'&&method==='POST')return linkedEndpoint(db,user,actor,'linked/connect','POST',{});
 throw new AllocationError('连接接口不存在',404);
}
