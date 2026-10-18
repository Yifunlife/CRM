import {digest,id,clean} from './crm';
import {AllocationError} from './allocation-server';
const kinds=['conversation','send','generate','rewrite','translate','pause','resume','material','email-sync','test-email'];
export async function bridgeUserEndpoint(db:D1Database,owner:any,actor:any,path:string,method:string,body:any){
 if(path==='workbench/bridge'&&method==='POST'){
  if(actor.role!=='admin'||owner.id===actor.id)throw new AllocationError('只有管理员可以配置 Winnie 收发连接',403);
  const token=id()+id();
  await db.batch([db.prepare("UPDATE crm_workbench_commands SET state='cancelled',updated=? WHERE owner_id=? AND state='queued'").bind(Date.now(),owner.id),db.prepare("INSERT INTO crm_workbench_bridge(owner_id,token_hash,created_by) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET token_hash=excluded.token_hash,created_by=excluded.created_by,seen=0,status='{}'").bind(owner.id,await digest(token),actor.id)]);
  return {token,owner_id:owner.id};
 }
 if(path==='workbench/live'&&method==='GET'){
  const row:any=await db.prepare('SELECT seen,status FROM crm_workbench_bridge WHERE owner_id=?').bind(owner.id).first();
  return {online:!!row&&Date.now()-row.seen<30000,seen:row?.seen||0,status:row?JSON.parse(row.status):{}};
 }
 if(path.startsWith('workbench/command/')&&method==='GET'){
  const row:any=await db.prepare('SELECT id,state,result,desktop_id FROM crm_workbench_commands WHERE id=? AND owner_id=?').bind(path.slice('workbench/command/'.length),owner.id).first();
  if(!row)throw new AllocationError('操作不存在',404);await ownedDesktop(db,owner.id,row.desktop_id);return {...row,result:JSON.parse(row.result)};
 }
 if(path==='workbench/command'&&method==='POST'){
  if(!kinds.includes(body.kind)||!/^[-a-zA-Z0-9]{16,80}$/.test(body.id||''))throw new AllocationError('操作格式无效');
  if(body.kind==='test-email'&&actor.role!=='admin')throw new AllocationError('只有管理员可以发送内部测试邮件',403);
  await ownedDesktop(db,owner.id,body.desktop_id);
  const payload={keep_desktop_draft:body.keep_desktop_draft===true,include_materials:body.include_materials===true,channel:body.channel==='email'?'email':'whatsapp',text:clean(body.text,12000),subject:clean(body.subject,200),instruction:clean(body.instruction,2000),reference:clean(body.reference,4000),revision:clean(body.revision,150),material:clean(body.material,30)};
  if(['send','translate','rewrite'].includes(body.kind)&&!payload.text)throw new AllocationError('请先填写消息');
  const existing:any=await db.prepare('SELECT * FROM crm_workbench_commands WHERE id=?').bind(body.id).first();
  if(existing){if(existing.owner_id!==owner.id||existing.desktop_id!==body.desktop_id||existing.kind!==body.kind||existing.payload!==JSON.stringify(payload))throw new AllocationError('操作编号已被使用',409);return {id:existing.id,state:existing.state};}
  const bridge:any=await db.prepare('SELECT seen FROM crm_workbench_bridge WHERE owner_id=?').bind(owner.id).first();
  if(!bridge||Date.now()-bridge.seen>=30000)throw new AllocationError('本地工作台离线，请打开工作台后再操作',409);
  if(['send','material','test-email'].includes(body.kind)&&await db.prepare("SELECT id FROM crm_workbench_commands WHERE owner_id=? AND desktop_id=? AND kind IN ('send','material','test-email') AND state IN ('queued','running','uncertain')").bind(owner.id,body.desktop_id).first())throw new AllocationError('此客户已有操作正在处理或结果待核实，请勿重复发送',409);
  const queued:any=await db.prepare("SELECT COUNT(*) n FROM crm_workbench_commands WHERE owner_id=? AND state IN ('queued','running')").bind(owner.id).first();
  if(queued.n>=20)throw new AllocationError('工作台正在处理，请稍后重试',429);
  await db.prepare('INSERT INTO crm_workbench_commands(id,owner_id,desktop_id,kind,payload,state,created,updated,actor_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(body.id,owner.id,body.desktop_id,body.kind,JSON.stringify(payload),'queued',Date.now(),Date.now(),actor.id).run();
  return {id:body.id,state:'queued'};
 }
 return undefined;
}
async function ownedDesktop(db:D1Database,ownerId:string,desktopId:string){
 const row:any=await db.prepare('SELECT payload FROM crm_workbench_snapshots WHERE owner_id=?').bind(ownerId).first();
 if(!row||!JSON.parse(row.payload).clients.some((c:any)=>c.id===desktopId))throw new AllocationError('会话不属于当前业务员',404);
 const link:any=await db.prepare('SELECT l.owner_id FROM crm_workbench_links w JOIN crm_leads l ON l.id=w.lead_id WHERE w.owner_id=? AND w.desktop_id=?').bind(ownerId,desktopId).first();
 if(link&&link.owner_id!==ownerId)throw new AllocationError('客资已重新分配，不能继续操作',403);
}
export async function bridgeDeviceEndpoint(db:D1Database,req:Request,body:any){
 const bearer=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 const device:any=bearer?await db.prepare('SELECT b.*,u.active,u.role FROM crm_workbench_bridge b JOIN crm_users u ON u.id=b.owner_id WHERE b.token_hash=?').bind(await digest(bearer)).first():null;
 if(!device||!device.active||device.role!=='sales')throw new AllocationError('收发连接认证失败',401);
 const timestamp=Date.now();
 await db.prepare("DELETE FROM crm_workbench_commands WHERE owner_id=? AND kind='conversation' AND updated<?").bind(device.owner_id,timestamp-600000).run();
 if(body.status){const s=body.status;await db.prepare('UPDATE crm_workbench_bridge SET seen=?,status=? WHERE owner_id=?').bind(timestamp,JSON.stringify({whatsapp:!!s.whatsapp,email:!!s.email,reception:!!s.reception,error:clean(s.error,300)}),device.owner_id).run();}
 if(body.result){
  const r=body.result;if(!['done','failed','uncertain'].includes(r.state)||JSON.stringify(r.value||{}).length>250000)throw new AllocationError('操作结果无效');
  await db.prepare("UPDATE crm_workbench_commands SET state=?,result=?,updated=? WHERE id=? AND owner_id=? AND state='running'").bind(r.state,JSON.stringify(r.value||{}),timestamp,r.id,device.owner_id).run();
  if(r.state==='done'&&r.value?.status==='sent'){
   const sent:any=await db.prepare("SELECT desktop_id,payload,actor_id FROM crm_workbench_commands WHERE id=? AND owner_id=? AND kind='send'").bind(r.id,device.owner_id).first();
   if(sent){const p=JSON.parse(sent.payload);await db.prepare("UPDATE crm_workbench_drafts SET content='',updated=?,updated_by=? WHERE owner_id=? AND channel=? AND content=? AND lead_id IN (SELECT w.lead_id FROM crm_workbench_links w JOIN crm_leads l ON l.id=w.lead_id WHERE w.owner_id=? AND w.desktop_id=? AND l.owner_id=w.owner_id)").bind(new Date(timestamp).toISOString(),sent.actor_id,device.owner_id,p.channel==='email'?'邮件':'WhatsApp',p.text,device.owner_id,sent.desktop_id).run();}
  }
 }
 await db.prepare("UPDATE crm_workbench_commands SET state='failed',result=?,updated=? WHERE owner_id=? AND state='queued' AND created<?").bind(JSON.stringify({error:'操作等待超时，未执行，请重新确认'}),timestamp,device.owner_id,timestamp-60000).run();
 // Running work is never automatically reclaimed: a lost receipt must not cause a duplicate send.
 await db.prepare("UPDATE crm_workbench_commands SET state='uncertain',result=?,updated=? WHERE owner_id=? AND state='running' AND updated<?").bind(JSON.stringify({error:'执行结果待核实，不会自动重发'}),timestamp,device.owner_id,timestamp-300000).run();
 if(body.heartbeat||body.result)return {ok:true};
 const next:any=await db.prepare("SELECT * FROM crm_workbench_commands WHERE owner_id=? AND state='queued' ORDER BY created LIMIT 1").bind(device.owner_id).first();
 if(!next)return {command:null};
 try{await ownedDesktop(db,device.owner_id,next.desktop_id);}catch{await db.prepare("UPDATE crm_workbench_commands SET state='failed',result=?,updated=? WHERE id=? AND state='queued'").bind(JSON.stringify({error:'客户归属已变化，未执行'}),timestamp,next.id).run();return {command:null};}
 const claimed:any=await db.prepare("UPDATE crm_workbench_commands SET state='running',updated=? WHERE id=? AND state='queued' RETURNING id").bind(timestamp,next.id).first();
 return {command:claimed?{id:next.id,desktop_id:next.desktop_id,kind:next.kind,payload:JSON.parse(next.payload)}:null};
}
