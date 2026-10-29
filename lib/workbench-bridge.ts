import {readJson,storeJson} from './object-storage';
import {digest,id,clean} from './crm';
import {AllocationError} from './allocation-server';
const kinds=['unread','read','conversation','send','generate','rewrite','translate','pause','resume','material','email-sync','test-email','directory','client-update','client-create','archive','record-add','scenes','scene-save','message-translate'];
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
  if(!row)throw new AllocationError('操作不存在',404);await ownedDesktop(db,owner.id,row.desktop_id);return {...row,result:await readJson(row.result)};
 }
 if(path==='workbench/command'&&method==='POST'){
  if(!kinds.includes(body.kind)||!/^[-a-zA-Z0-9]{16,80}$/.test(body.id||''))throw new AllocationError('操作格式无效');
  if(body.kind==='test-email'&&actor.role!=='admin')throw new AllocationError('只有管理员可以发送内部测试邮件',403);
  if(body.kind==='scene-save'&&actor.role!=='admin')throw new AllocationError('公司场景由管理员审核发布',403);
  await ownedDesktop(db,owner.id,body.desktop_id);
  const payload={keep_desktop_draft:body.keep_desktop_draft===true,include_materials:body.include_materials===true,channel:body.channel==='email'?'email':'whatsapp',text:clean(body.text,12000),subject:clean(body.subject,200),instruction:clean(body.instruction,2000),reference:clean(body.reference,4000),revision:clean(body.revision,150),material:clean(body.material,30)};
  if(body.kind==='read')(payload as any).keys=(Array.isArray(body.keys)?body.keys:[]).filter((k:any)=>typeof k==='string'&&k.length<300).slice(-80);
  if(body.kind==='archive')(payload as any).offset=Math.max(0,Math.floor(Number(body.offset)||0));
  if(body.kind==='record-add'){(payload as any).recordType=body.recordType==='handover'?'handover':'note';(payload as any).actorName=actor.name;}
  if(body.kind==='message-translate')(payload as any).messageKey=clean(body.messageKey,300);
  if(body.kind==='scene-save'){(payload as any).configRevision=clean(body.configRevision,150);const s=body.scene||{};(payload as any).scene={id:clean(s.id,150),name:clean(s.name,80),category:clean(s.category,40),triggers:clean(s.triggers,4000),reply:clean(s.reply,2000),note:clean(s.note,2000),enabled:!!s.enabled};}
  if(body.kind==='client-update'){if(!Array.isArray(body.changes)||!body.changes.length||body.changes.length>100)throw new AllocationError('请选择1至100位客户');for(const change of body.changes)await ownedDesktop(db,owner.id,change.id);(payload as any).changes=body.changes.map((x:any)=>({id:clean(x.id,150),revision:clean(x.revision,150),patch:clientPatch(x.patch)}));}
  if(body.kind==='client-create')(payload as any).patch=clientPatch(body.patch);
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
export async function ownedDesktop(db:D1Database,ownerId:string,desktopId:string){
 const row:any=await db.prepare('SELECT payload FROM crm_workbench_snapshots WHERE owner_id=?').bind(ownerId).first();
 if(!row||![...(await readJson(row.payload)).clients,...((await readJson(row.payload)).groups||[])].some((c:any)=>c.id===desktopId))throw new AllocationError('会话不属于当前业务员',404);
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
  const r=body.result;if(!['done','failed','uncertain'].includes(r.state)||JSON.stringify(r.value||{}).length>1500000)throw new AllocationError('操作结果无效');
  const completed:any=await db.prepare("SELECT * FROM crm_workbench_commands WHERE id=? AND owner_id=? AND state IN ('running','done')").bind(r.id,device.owner_id).first();
  if(!completed)return {ok:true};
  if(completed.state==='done'&&(r.state!=='done'||JSON.stringify(await readJson(completed.result))!==JSON.stringify(r.value||{})))return {ok:true};
  await db.prepare("UPDATE crm_workbench_commands SET state=?,result=?,updated=? WHERE id=? AND owner_id=? AND state='running'").bind(r.state,await storeJson(r.value||{},`results/${device.owner_id}`),timestamp,r.id,device.owner_id).run();
  if(r.state==='done'&&Array.isArray(r.value?.clients)){
   const job:any=await db.prepare('SELECT kind FROM crm_workbench_commands WHERE id=? AND owner_id=?').bind(r.id,device.owner_id).first();
   if(job&&['directory','client-update','client-create'].includes(job.kind)){
    const row:any=await db.prepare('SELECT payload FROM crm_workbench_snapshots WHERE owner_id=?').bind(device.owner_id).first();
    if(row){const snapshot=(await readJson(row.payload));if(job.kind==='directory'){snapshot.groups=(r.value.groups||[]).filter((g:any)=>/^group:\d+@g\.us$/.test(g.id)).map((g:any)=>({id:g.id,name:clean(g.name,200),group:true}));snapshot.scenes=(r.value.scenes||[]).map((s:any)=>({id:clean(s.id,150),name:clean(s.name,80),category:clean(s.category,40),reply:clean(s.reply,2000)}));}for(const raw of r.value.clients){const patch=clientPatch(Object.fromEntries(clientFields.filter(k=>k in raw).map(k=>[k,raw[k]])));const metadata={...patch,id:clean(raw.id,150),phone:patch.whatsapp||'',revision:clean(raw.revision,150),createdAt:clean(raw.createdAt,50),lastContact:clean(raw.lastContact,50)};const previous=snapshot.clients.find((c:any)=>c.id===metadata.id);if(previous)Object.assign(previous,metadata);else snapshot.clients.push({...metadata,messages:[]});}await db.prepare('UPDATE crm_workbench_snapshots SET payload=?,updated=? WHERE owner_id=?').bind(await storeJson(snapshot,`snapshots/${device.owner_id}`,true),new Date().toISOString(),device.owner_id).run();}
   }
  }
  if(r.state==='done'&&completed.kind==='client-create'&&r.value?.created_id){
   const leadId=JSON.parse(completed.payload).crm_lead_id;
   if(leadId&&r.value.clients?.some((c:any)=>c.id===r.value.created_id))await db.prepare('INSERT OR IGNORE INTO crm_workbench_links(lead_id,owner_id,desktop_id,created,created_by) SELECT id,owner_id,?,?,? FROM crm_leads WHERE id=? AND owner_id=?').bind(r.value.created_id,new Date(timestamp).toISOString(),completed.actor_id,leadId,device.owner_id).run();
  }
  if(r.state==='done'&&['sent','confirmed_sent'].includes(r.value?.status)&&['send','material'].includes(completed.kind)){
   await recordOnlineContact(db,device.owner_id,completed.desktop_id,r.value.messageId?'message:'+JSON.parse(completed.payload).channel+':'+r.value.messageId:'command:'+completed.id,JSON.parse(completed.payload).channel,JSON.parse(completed.payload).text||'已发送客户资料',false,timestamp);
  }
  if(r.state==='done'&&completed.kind==='conversation'&&Array.isArray(r.value?.messages)){
   const prior:any=await db.prepare("SELECT result FROM crm_workbench_commands WHERE owner_id=? AND desktop_id=? AND kind='conversation' AND state='done' AND id<>? AND json_extract(payload,'$.channel')=? ORDER BY updated DESC LIMIT 1").bind(device.owner_id,completed.desktop_id,completed.id,JSON.parse(completed.payload).channel).first();
   if(prior){const previous=await readJson(prior.result),known=new Set((previous.messages||[]).map((m:any)=>m.key)),anchor=(previous.messages||[]).filter((m:any)=>m.key).at(-1)?.key,anchorIndex=anchor?r.value.messages.findIndex((m:any)=>m.key===anchor):-1;
    for(const m of anchorIndex<0?[]:r.value.messages.slice(anchorIndex+1)){if(!m.key||!m.speaker||known.has(m.key))continue;const incoming=!/^Winnie Wu(?: \(Email\))?$/.test(m.speaker||'');await recordOnlineContact(db,device.owner_id,completed.desktop_id,'message:'+m.channel+':'+(m.channel==='whatsapp'?m.key.split(':').at(-1):m.key),m.channel,m.text||'非文字消息',incoming,timestamp);}
   }
  }
  if(r.state==='done'&&['sent','confirmed_sent'].includes(r.value?.status)){
   const sent:any=await db.prepare("SELECT desktop_id,payload,actor_id FROM crm_workbench_commands WHERE id=? AND owner_id=? AND kind='send'").bind(r.id,device.owner_id).first();
   if(sent){const p=JSON.parse(sent.payload);await db.prepare("UPDATE crm_workbench_drafts SET content='',updated=?,updated_by=? WHERE owner_id=? AND channel=? AND content=? AND lead_id IN (SELECT w.lead_id FROM crm_workbench_links w JOIN crm_leads l ON l.id=w.lead_id WHERE w.owner_id=? AND w.desktop_id=? AND l.owner_id=w.owner_id)").bind(new Date(timestamp).toISOString(),sent.actor_id,device.owner_id,p.channel==='email'?'邮件':'WhatsApp',p.text,device.owner_id,sent.desktop_id).run();}
  }
 }
 await db.prepare("UPDATE crm_workbench_commands SET state='failed',result=?,updated=? WHERE owner_id=? AND state='queued' AND created<?").bind(JSON.stringify({error:'操作等待超时，未执行，请重新确认'}),timestamp,device.owner_id,timestamp-60000).run();
 // Running work is never automatically reclaimed: a lost receipt must not cause a duplicate send.
 await db.prepare("UPDATE crm_workbench_commands SET state='uncertain',result=?,updated=? WHERE owner_id=? AND state='running' AND updated<?").bind(JSON.stringify({error:'执行结果待核实，不会自动重发'}),timestamp,device.owner_id,timestamp-300000).run();
 if(body.heartbeat||body.result)return {ok:true};
 const next:any=await db.prepare("SELECT * FROM crm_workbench_commands WHERE owner_id=? AND state='queued' ORDER BY CASE WHEN kind='read' THEN 0 WHEN kind='unread' THEN 1 ELSE 2 END,created LIMIT 1").bind(device.owner_id).first();
 if(!next)return {command:null};
 try{await ownedDesktop(db,device.owner_id,next.desktop_id);if(next.kind==='client-update')for(const change of JSON.parse(next.payload).changes)await ownedDesktop(db,device.owner_id,change.id);}catch{await db.prepare("UPDATE crm_workbench_commands SET state='failed',result=?,updated=? WHERE id=? AND state='queued'").bind(JSON.stringify({error:'客户归属已变化，未执行'}),timestamp,next.id).run();return {command:null};}
 const claimed:any=await db.prepare("UPDATE crm_workbench_commands SET state='running',updated=? WHERE id=? AND state='queued' RETURNING id").bind(timestamp,next.id).first();
 return {command:claimed?{id:next.id,desktop_id:next.desktop_id,kind:next.kind,payload:JSON.parse(next.payload)}:null};
}

const clientFields=['name','country','project','grade','stage','projectStatus','whatsapp','email','source','customerType','nextAction','nextContact','followStatus','closeDate','amount','lostReason','notes'];
function clientPatch(p:any):any{if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!clientFields.includes(k)))throw new AllocationError('客户字段无效');return Object.fromEntries(Object.entries(p).map(([k,v])=>[k,k==='stage'?Number(v):clean(v,['notes','lostReason','nextAction'].includes(k)?6000:500)]));}

async function recordOnlineContact(db:D1Database,owner:string,desktop:string,event:string,channel:string,text:string,incoming:boolean,timestamp:number){
 const lead:any=await db.prepare('SELECT l.* FROM crm_workbench_links w JOIN crm_leads l ON l.id=w.lead_id WHERE w.owner_id=? AND w.desktop_id=? AND l.owner_id=w.owner_id').bind(owner,desktop).first();if(!lead)return;
 const noteId='online-'+await digest(owner+':'+lead.id+':'+event),at=new Date(timestamp).toISOString();
 const existing=await db.prepare('SELECT id FROM crm_notes WHERE id=?').bind(noteId).first();if(existing)return;
 const method=incoming?'系统收信':channel==='email'?'邮件':'WhatsApp';
 await db.batch([db.prepare('INSERT OR IGNORE INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES(?,?,?,?,?,?,?)').bind(noteId,lead.id,owner,(incoming?'客户线上回复':'线上发送已确认')+'｜'+clean(text,12000)+'\n沟通凭据：'+event,method,'',at),db.prepare("UPDATE crm_leads SET status=CASE WHEN status IN ('待首次联系','已联系待回复','正在沟通') THEN ? ELSE status END,last_contact=? WHERE id=? AND owner_id=?").bind(incoming?'正在沟通':lead.status==='正在沟通'?'正在沟通':'已联系待回复',at,lead.id,owner)]);
}
