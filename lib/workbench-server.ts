import {readJson,storeJson} from './object-storage';
import {bridgeUserEndpoint} from './workbench-bridge';
import {id,now,clean,phoneKey,emailKey,digest} from './crm';
import {AllocationError} from './allocation-server';
export async function viewUser(db:D1Database,actor:any,view:string|null){
 if(!view||view==='boss')return actor;
 if(view!=='winnie'||actor.role!=='admin')throw new AllocationError('无权切换此视角',403);
 const target:any=await db.prepare("SELECT id,username,name,role,permissions FROM crm_users WHERE id=COALESCE((SELECT owner_id FROM crm_workbench_snapshots ORDER BY updated LIMIT 1),(SELECT id FROM crm_users WHERE username='winnie')) AND role='sales' AND active=1").first();
 if(!target)throw new AllocationError('Winnie账号不存在或已停用',409);
 return {...target,can_switch:true,actor_name:actor.name};
}
export async function workbenchEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 if(!path.startsWith('workbench/'))return undefined;
 if(!['admin','sales'].includes(user.role))throw new AllocationError('此页面仅供业务员与管理员使用',403);
 const owner:any=user.role==='admin'?await db.prepare("SELECT id,name FROM crm_users WHERE id=COALESCE((SELECT owner_id FROM crm_workbench_snapshots ORDER BY updated LIMIT 1),(SELECT id FROM crm_users WHERE username='winnie')) AND role='sales' AND active=1").first():user;
 if(!owner)throw new AllocationError('请先启用Winnie账号',409);
 const bridge=await bridgeUserEndpoint(db,owner,actor,path,method,body);if(bridge!==undefined)return bridge;
 if(path==='workbench/snapshot'&&method==='GET'){
  const row:any=await db.prepare('SELECT payload,updated FROM crm_workbench_snapshots WHERE owner_id=?').bind(owner.id).first();
  return {owner,updated:row?.updated||'',snapshot:row?(await readJson(row.payload)):null};
 }
 if(path==='workbench/snapshot'&&method==='POST'){
  if(user.role!=='admin'||actor.role!=='admin')throw new AllocationError('只有老板视角可以同步工作台资料',403);
  if(body.format!=='yifun-workbench-v1'||body.owner!=='winnie'||!Array.isArray(body.clients)||!Array.isArray(body.scenes)||body.clients.length>5000||body.scenes.length>300||!Number.isFinite(Date.parse(body.captured_at)))throw new AllocationError('工作台同步文件格式无效');
  const seen=new Set<string>();
  const clients=body.clients.map((c:any)=>{
   if(!c.id||seen.has(c.id)||!Array.isArray(c.messages)||c.messages.length>500)throw new AllocationError('客户编号重复或会话格式无效');seen.add(c.id);
   return {id:clean(c.id,150),name:clean(c.name,200),phone:clean(c.phone,100),email:clean(c.email,200),country:clean(c.country,100),stage:clean(c.stage,100),messages:c.messages.map((m:any)=>({channel:clean(m.channel,30),timestamp:clean(m.timestamp,50),speaker:clean(m.speaker,200),subject:clean(m.subject,500),text:clean(m.text,12000)}))};
  });
  const payload={format:body.format,captured_at:body.captured_at,clients,scenes:body.scenes.map((s:any)=>({id:clean(s.id,100),name:clean(s.name,200),category:clean(s.category,40),reply:clean(s.reply,12000)}))};
  if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>1500000)throw new AllocationError('会话资料超过1.5MB，请缩小历史范围');
  const previous:any=await db.prepare('SELECT payload FROM crm_workbench_snapshots WHERE owner_id=?').bind(owner.id).first();
  if(previous&&Date.parse((await readJson(previous.payload)).captured_at)>Date.parse(body.captured_at))throw new AllocationError('文件早于当前同步版本，请重新导出',409);
  await db.prepare('INSERT INTO crm_workbench_snapshots(owner_id,payload,updated,updated_by) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET payload=excluded.payload,updated=excluded.updated,updated_by=excluded.updated_by').bind(owner.id,await storeJson(payload,`snapshots/${owner.id}`,true),now(),actor.id).run();
  return {clients:clients.length,scenes:payload.scenes.length};
 }
 if(path==='workbench/prepare'&&method==='POST'){
  const lead:any=await db.prepare('SELECT * FROM crm_leads WHERE id=? AND owner_id=?').bind(body.lead_id,owner.id).first();
  if(!lead)throw new AllocationError('客资不存在或不属于当前业务员',404);
  const linked:any=await db.prepare('SELECT desktop_id,owner_id FROM crm_workbench_links WHERE lead_id=?').bind(lead.id).first();
  if(linked){if(linked.owner_id!==owner.id)throw new AllocationError('原沟通归属需要核对，资料已保留',409);return {desktop_id:linked.desktop_id};}
  const row:any=await db.prepare('SELECT payload FROM crm_workbench_snapshots WHERE owner_id=?').bind(owner.id).first();
  if(!row)throw new AllocationError('客资已在我的客户中；请先连接本人的客户沟通工作台',409);
  const clients=(await readJson(row.payload)).clients||[],phone=phoneKey(lead.phone),email=emailKey(lead.email);
  const matches=clients.filter((c:any)=>(phone&&phoneKey(c.whatsapp||c.phone)===phone)||(email&&emailKey(c.email)===email));
  if(matches.length>1)throw new AllocationError('电话或邮箱对应多个会话，需要核对，未重复建档',409);
  if(matches.length){const c=matches[0],conflict=await db.prepare('SELECT lead_id FROM crm_workbench_links WHERE owner_id=? AND desktop_id=?').bind(owner.id,c.id).first();if(conflict)throw new AllocationError('该会话已关联另一客资，需先核对',409);await db.prepare('INSERT INTO crm_workbench_links(lead_id,owner_id,desktop_id,created,created_by) VALUES(?,?,?,?,?)').bind(lead.id,owner.id,c.id,now(),actor.id).run();return {desktop_id:c.id};}
  if(!phone&&!email)throw new AllocationError('客资已入档，但缺少电话和邮箱，暂不能建立线上会话',409);
  const jobId='prepare-'+await digest(owner.id+':'+lead.id),job:any=await db.prepare('SELECT id,state FROM crm_workbench_commands WHERE id=?').bind(jobId).first();
  if(job){if(['failed','cancelled'].includes(job.state))throw new AllocationError('会话准备未完成，请刷新会话目录后重试或核对连接',409);return {command_id:job.id};}
  const connection:any=await db.prepare('SELECT seen FROM crm_workbench_bridge WHERE owner_id=?').bind(owner.id).first();
  if(!connection||Date.now()-connection.seen>=30000||!clients.length)throw new AllocationError('客资资料已保留，连接本人的工作台后即可自动准备会话',409);
  let detail:any={};try{detail=JSON.parse(lead.detail||'{}');}catch{}
  const payload={crm_lead_id:lead.id,patch:{name:lead.name,country:lead.country||'',whatsapp:lead.phone||'',email:lead.email||'',source:lead.source||'',notes:detail['项目需求描述']||detail.briefly_describe_your_project_needs||''}};
  await db.prepare("INSERT OR IGNORE INTO crm_workbench_commands(id,owner_id,desktop_id,kind,payload,state,created,updated,actor_id) VALUES(?,?,?,'client-create',?,'queued',?,?,?)").bind(jobId,owner.id,clients[0].id,JSON.stringify(payload),Date.now(),Date.now(),actor.id).run();return {command_id:jobId};
 }
 if(path==='workbench/links'&&method==='GET')return (await db.prepare('SELECT w.lead_id,w.desktop_id FROM crm_workbench_links w JOIN crm_leads l ON l.id=w.lead_id WHERE w.owner_id=? AND l.owner_id=w.owner_id').bind(owner.id).all()).results;
 if(path==='workbench/links'&&method==='POST'){
  const lead:any=await db.prepare('SELECT id FROM crm_leads WHERE id=? AND owner_id=?').bind(body.lead_id,owner.id).first();
  const row:any=await db.prepare('SELECT payload FROM crm_workbench_snapshots WHERE owner_id=?').bind(owner.id).first();
  if(!lead||!row||!(await readJson(row.payload)).clients.some((c:any)=>c.id===body.desktop_id))throw new AllocationError('客户不存在或不属于当前业务员',404);
  const existing:any=await db.prepare('SELECT lead_id,desktop_id FROM crm_workbench_links WHERE lead_id=? OR (owner_id=? AND desktop_id=?)').bind(lead.id,owner.id,body.desktop_id).first();
  if(existing){if(existing.lead_id===lead.id&&existing.desktop_id===body.desktop_id)return {ok:true};throw new AllocationError('已有其他关联，请先核对客户，不能覆盖',409);}
  await db.prepare('INSERT INTO crm_workbench_links(lead_id,owner_id,desktop_id,created,created_by) VALUES(?,?,?,?,?)').bind(lead.id,owner.id,body.desktop_id,now(),actor.id).run();return {ok:true};
 }
 if(path==='workbench/drafts'&&method==='GET')return (await db.prepare('SELECT d.lead_id,d.channel,d.content,d.updated FROM crm_workbench_drafts d JOIN crm_leads l ON l.id=d.lead_id WHERE d.owner_id=? AND l.owner_id=d.owner_id').bind(owner.id).all()).results;
 if(path==='workbench/drafts'&&method==='POST'){
  if(!['WhatsApp','邮件'].includes(body.channel))throw new AllocationError('请选择沟通渠道');
  const lead:any=await db.prepare('SELECT id,owner_id FROM crm_leads WHERE id=? AND owner_id=?').bind(body.lead_id,owner.id).first();
  if(!lead)throw new AllocationError('此客资不属于当前业务员',404);
  await db.prepare('INSERT INTO crm_workbench_drafts(id,lead_id,owner_id,channel,content,updated,updated_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(lead_id,owner_id,channel) DO UPDATE SET content=excluded.content,updated=excluded.updated,updated_by=excluded.updated_by').bind(id(),lead.id,owner.id,body.channel,clean(body.content,12000),now(),actor.id).run();return {ok:true};
 }
 throw new AllocationError('工作台操作不存在',404);
}
