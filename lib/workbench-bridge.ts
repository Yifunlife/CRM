import {CONTACT_GRADES,customerLeadSQL,cancelColleagueFirstContacts} from './contact-kind';
import {ensureCustomerCode} from './customer-code';
import {customerProfile,validateCustomerProfile} from './customer-profile';
import {queueFirstContacts,autoContactAllowed} from './auto-first-contact';
import {readJson,storeJson} from './object-storage';
import {digest,id,clean,phoneKey,emailKey,now,can} from './crm';
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
  const history:any=await db.prepare('SELECT COUNT(*) customers,COALESCE(SUM(complete),0) completed FROM crm_workbench_history_progress WHERE owner_id=?').bind(owner.id).first();
  const messages:any=await db.prepare('SELECT COUNT(*) messages FROM crm_workbench_history WHERE owner_id=?').bind(owner.id).first();
  return {online:!!row&&Date.now()-row.seen<30000,seen:row?.seen||0,status:row?JSON.parse(row.status):{},history:{...history,...messages}};
 }
 const historyPage=/^workbench\/history\/([-a-zA-Z0-9_:]+)\/(\d+)$/.exec(path);
 if(historyPage&&method==='GET'){
  const desktop=historyPage[1],offset=Number(historyPage[2]);await ownedDesktop(db,owner.id,desktop);
  const total:any=await db.prepare('SELECT COUNT(*) n FROM crm_workbench_history WHERE owner_id=? AND desktop_id=?').bind(owner.id,desktop).first();
  const rows=(await db.prepare('SELECT payload FROM crm_workbench_history WHERE owner_id=? AND desktop_id=? ORDER BY sort_time,message_key LIMIT 100 OFFSET ?').bind(owner.id,desktop,offset).all<any>()).results;
  const progress=await db.prepare('SELECT total,received,complete,updated FROM crm_workbench_history_progress WHERE owner_id=? AND desktop_id=?').bind(owner.id,desktop).first();
  return {total:total.n,messages:await Promise.all(rows.map(row=>readJson(row.payload))),progress};
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
 const device:any=bearer?await db.prepare('SELECT b.*,u.active,u.role,u.permissions,u.username,u.name FROM crm_workbench_bridge b JOIN crm_users u ON u.id=b.owner_id WHERE b.token_hash=?').bind(await digest(bearer)).first():null;
 if(!device||!device.active||!['sales','management','ceo'].includes(device.role)||device.role==='management'&&!await db.prepare('SELECT owner_id FROM crm_workbench_snapshots WHERE owner_id=?').bind(device.owner_id).first())throw new AllocationError('收发连接认证失败',401);
 if(body.connect===true)return {owner_id:device.owner_id,username:device.username,name:device.name,protocol:2,can_import:device.role!=='sales'||can(device,'customers_edit')};
 if(body.contact_receipts)return synchronizeContactReceipts(db,device.owner_id,body.contact_receipts);
 if(body.history)return synchronizeHistory(db,device.owner_id,body.history);
 if(body.sync){const result=await synchronizeWorkbench(db,device.owner_id,{...body.sync,catalog_only:body.sync.catalog_only===true||device.role==='sales'&&!can(device,'customers_edit')});await queueFirstContacts(db,device.owner_id);return result;}
 const timestamp=Date.now();
 await db.prepare("DELETE FROM crm_workbench_commands WHERE owner_id=? AND kind='conversation' AND updated<?").bind(device.owner_id,timestamp-600000).run();
 if(body.status){const s=body.status;await db.prepare('UPDATE crm_workbench_bridge SET seen=?,status=? WHERE owner_id=?').bind(timestamp,JSON.stringify({whatsapp:!!s.whatsapp,email:!!s.email,reception:!!s.reception,autoFirstContact:!!s.autoFirstContact,error:clean(s.error,300)}),device.owner_id).run();}
 if(body.result){
  const r=body.result;if(!['done','failed','uncertain'].includes(r.state)||JSON.stringify(r.value||{}).length>1500000)throw new AllocationError('操作结果无效');
  const completed:any=await db.prepare("SELECT * FROM crm_workbench_commands WHERE id=? AND owner_id=? AND state IN ('running','done')").bind(r.id,device.owner_id).first();
  if(!completed)return {ok:true};
  if(completed.state==='done'&&(r.state!=='done'||JSON.stringify(await readJson(completed.result))!==JSON.stringify(r.value||{})))return {ok:true};
  if(JSON.parse(completed.payload).auto_first_contact&&r.state==='done'&&['sent','confirmed_sent'].includes(r.value?.status)&&!r.value.messageId){r.state='uncertain';r.value={status:'uncertain',detail:'自动首联未收到可核对的发送回执，不会自动重发'};}
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
   await recordOnlineContact(db,device.owner_id,completed.desktop_id,r.value.messageId?'message:'+JSON.parse(completed.payload).channel+':'+r.value.messageId:'command:'+completed.id,JSON.parse(completed.payload).channel,(JSON.parse(completed.payload).auto_first_contact?r.value.text:JSON.parse(completed.payload).text)||'已发送客户资料',false,timestamp);
  }
  if(r.state==='done'&&completed.kind==='conversation'&&Array.isArray(r.value?.messages)){
   const prior:any=await db.prepare("SELECT result FROM crm_workbench_commands WHERE owner_id=? AND desktop_id=? AND kind='conversation' AND state='done' AND id<>? AND json_extract(payload,'$.channel')=? ORDER BY updated DESC LIMIT 1").bind(device.owner_id,completed.desktop_id,completed.id,JSON.parse(completed.payload).channel).first();
   if(prior){const previous=await readJson(prior.result),known=new Set((previous.messages||[]).map((m:any)=>m.key)),anchor=(previous.messages||[]).filter((m:any)=>m.key).at(-1)?.key,anchorIndex=anchor?r.value.messages.findIndex((m:any)=>m.key===anchor):-1;
    for(const m of anchorIndex<0?[]:r.value.messages.slice(anchorIndex+1)){if(!m.key||!m.speaker||known.has(m.key))continue;const incoming=typeof m.outgoing==='boolean'?!m.outgoing:!/^Winnie Wu(?: \(Email\))?$/.test(m.speaker||'');await recordOnlineContact(db,device.owner_id,completed.desktop_id,'message:'+m.channel+':'+(m.channel==='whatsapp'?m.key.split(':').at(-1):m.key),m.channel,m.text||'非文字消息',incoming,timestamp);}
   }
  }
  if(r.state==='done'&&['sent','confirmed_sent'].includes(r.value?.status)){
   const sent:any=await db.prepare("SELECT desktop_id,payload,actor_id FROM crm_workbench_commands WHERE id=? AND owner_id=? AND kind='send'").bind(r.id,device.owner_id).first();
   if(sent){const p=JSON.parse(sent.payload);await db.prepare("UPDATE crm_workbench_drafts SET content='',updated=?,updated_by=? WHERE owner_id=? AND channel=? AND content=? AND lead_id IN (SELECT w.lead_id FROM crm_workbench_links w JOIN crm_leads l ON l.id=w.lead_id WHERE w.owner_id=? AND w.desktop_id=? AND l.owner_id=w.owner_id)").bind(new Date(timestamp).toISOString(),sent.actor_id,device.owner_id,p.channel==='email'?'邮件':'WhatsApp',p.text,device.owner_id,sent.desktop_id).run();}
  }
 }
 await db.prepare("UPDATE crm_workbench_commands SET state='failed',result=?,updated=? WHERE owner_id=? AND state='queued' AND COALESCE(json_extract(payload,'$.auto_first_contact'),0)<>1 AND created<?").bind(JSON.stringify({error:'操作等待超时，未执行，请重新确认'}),timestamp,device.owner_id,timestamp-60000).run();
 // Running work is never automatically reclaimed: a lost receipt must not cause a duplicate send.
 await db.prepare("UPDATE crm_workbench_commands SET state='uncertain',result=?,updated=? WHERE owner_id=? AND state='running' AND updated<?").bind(JSON.stringify({error:'执行结果待核实，不会自动重发'}),timestamp,device.owner_id,timestamp-300000).run();
 if(body.heartbeat&&body.status?.autoFirstContact)await queueFirstContacts(db,device.owner_id);
 if(body.heartbeat||body.result)return {ok:true};
 const next:any=await db.prepare("SELECT * FROM crm_workbench_commands WHERE owner_id=? AND state='queued' ORDER BY CASE WHEN kind='read' THEN 0 WHEN kind='unread' THEN 1 ELSE 2 END,created LIMIT 1").bind(device.owner_id).first();
 if(!next)return {command:null};
 try{await ownedDesktop(db,device.owner_id,next.desktop_id);const automatic=JSON.parse(next.payload);if(automatic.auto_first_contact&&!await autoContactAllowed(db,device.owner_id,automatic))throw new AllocationError('自动首联条件已变化',409);const targetLead=JSON.parse(next.payload).crm_lead_id;if(targetLead&&!await db.prepare('SELECT id FROM crm_leads WHERE id=? AND owner_id=?').bind(targetLead,device.owner_id).first())throw new AllocationError('客资归属已变化',403);if(next.kind==='client-update')for(const change of JSON.parse(next.payload).changes)await ownedDesktop(db,device.owner_id,change.id);}catch{await db.prepare("UPDATE crm_workbench_commands SET state='failed',result=?,updated=? WHERE id=? AND state='queued'").bind(JSON.stringify({error:'客户归属已变化，未执行'}),timestamp,next.id).run();return {command:null};}
 const claimed:any=await db.prepare(`UPDATE crm_workbench_commands SET state='running',updated=? WHERE id=? AND state='queued' AND (COALESCE(json_extract(payload,'$.auto_first_contact'),0)<>1 OR EXISTS(SELECT 1 FROM crm_leads l WHERE l.id=json_extract(crm_workbench_commands.payload,'$.crm_lead_id') AND ${customerLeadSQL()})) RETURNING id`).bind(timestamp,next.id).first();
 return {command:claimed?{id:next.id,desktop_id:next.desktop_id,kind:next.kind,payload:JSON.parse(next.payload)}:null};
}

const clientFields=['name','country','project','grade','stage','projectStatus','whatsapp','email','source','customerType','nextAction','nextContact','followStatus','closeDate','amount','lostReason','notes','contact','organization','city','role','currency'];
function clientPatch(p:any):any{if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!clientFields.includes(k)))throw new AllocationError('客户字段无效');return Object.fromEntries(Object.entries(p).map(([k,v])=>[k,k==='stage'?Number(v):clean(v,['notes','lostReason','nextAction'].includes(k)?6000:500)]));}

async function recordOnlineContact(db:D1Database,owner:string,desktop:string,event:string,channel:string,text:string,incoming:boolean,timestamp:number){
 const lead:any=await db.prepare('SELECT l.* FROM crm_workbench_links w JOIN crm_leads l ON l.id=w.lead_id WHERE w.owner_id=? AND w.desktop_id=? AND l.owner_id=w.owner_id').bind(owner,desktop).first();if(!lead)return;
 const noteId='online-'+await digest(owner+':'+lead.id+':'+event),at=new Date(timestamp).toISOString();
 const existing=await db.prepare('SELECT id FROM crm_notes WHERE id=?').bind(noteId).first();if(existing)return;
 const method=incoming?'系统收信':channel==='email'?'邮件':'WhatsApp';
 await db.batch([db.prepare('INSERT OR IGNORE INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES(?,?,?,?,?,?,?)').bind(noteId,lead.id,owner,(incoming?'客户线上回复':'线上发送已确认')+'｜'+clean(text,12000)+'\n沟通凭据：'+event,method,'',at),db.prepare("UPDATE crm_leads SET status=CASE WHEN status IN ('待首次联系','已联系待回复','正在沟通') THEN ? ELSE status END,last_contact=CASE WHEN last_contact>? THEN last_contact ELSE ? END WHERE id=? AND owner_id=?").bind(incoming?'正在沟通':lead.status==='正在沟通'?'正在沟通':'已联系待回复',at,at,lead.id,owner)]);
}

const fields={name:'name',country:'country',whatsapp:'phone',email:'email',grade:'grade',nextContact:'next_date',source:'source'} as const;
async function uploadNewWorkbenchClients(db:D1Database,owner:string,clients:any[],ids:unknown,catalogOnly:boolean){
 const uploaded:any[]=[],conflicts:any[]=[];
 if(ids===undefined)return {uploaded,conflicts};
 if(!Array.isArray(ids)||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!clients.some(c=>c.id===id)))throw new AllocationError('新增客资同步批次无效');
 if(!ids.length)return {uploaded,conflicts};
 if(catalogOnly)throw new AllocationError('此连接未开放新增客资写入',403);
 const contacts=(await db.prepare('SELECT id,owner_id,phone,email,fingerprint FROM crm_leads').all<any>()).results;
 const links=(await db.prepare('SELECT lead_id,owner_id,desktop_id FROM crm_workbench_links').all<any>()).results;
 const person:any=await db.prepare('SELECT name FROM crm_users WHERE id=? AND active=1').bind(owner).first();
 for(const desktop of ids){
  const c=clients.find(c=>c.id===desktop),p=phoneKey(c.whatsapp),e=emailKey(c.email),reject=(reason:string)=>conflicts.push({desktop_id:desktop,reason});
  if(desktop.startsWith('crm-')||!c.name||c.grade&&!CONTACT_GRADES.includes(c.grade)){reject('本地客户资料需核对，未新建');continue;}
  if(p&&!/^\d{8,15}$/.test(p)||e&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)){reject('本地联系方式需核对，未新建');continue;}
  const expected='wb-'+await digest(owner+':'+desktop),priorLink=links.find(l=>l.owner_id===owner&&l.desktop_id===desktop);
  const exact=contacts.find(l=>l.id===expected),matches=contacts.filter(l=>p&&phoneKey(l.phone)===p||e&&emailKey(l.email)===e);
  if(priorLink&&contacts.find(l=>l.id===priorLink.lead_id)?.owner_id!==owner||exact&&exact.owner_id!==owner||matches.some(l=>l.owner_id!==owner)){reject('该联系方式已有客资，需核对归属，未新建');continue;}
  if(clients.some(other=>other.id!==desktop&&(p&&phoneKey(other.whatsapp)===p||e&&emailKey(other.email)===e))||matches.length>1){reject('电话或邮箱对应多个客户，请核对后关联');continue;}
  let lead=exact||matches[0];
  if(priorLink&&(!lead||lead.id!==priorLink.lead_id)||lead&&links.some(l=>l.lead_id===lead.id&&(l.owner_id!==owner||l.desktop_id!==desktop))){reject('已有客户会话关联需要核对，未改动');continue;}
  if(!lead){
   const stamp=now(),date=/^\d{4}-\d{2}-\d{2}$/.test(c.createdAt)?new Date(c.createdAt+'T00:00:00+08:00'):null,created=date&&Number.isFinite(date.getTime())&&date.getTime()<=Date.now()?date.toISOString():stamp;
   const detail=JSON.stringify({项目:c.project,客户类型:c.customerType,下一步:c.nextAction,备注:c.notes,本地阶段:c.stage,本地项目状态:c.projectStatus,_workbench:{...c,messages:undefined,owner_id:owner,desktop_id:desktop,synced_at:stamp}}),fingerprint='workbench:'+await digest(p?'phone:'+p:e?'email:'+e:'client:'+owner+':'+desktop);
   // Check again inside the write so concurrent uploads cannot claim the same contact.
   await db.batch([db.prepare("INSERT OR IGNORE INTO crm_leads(id,name,phone,email,country,source,entered,owner_id,original_owner,grade,next_date,detail,fingerprint,review,created) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM crm_leads WHERE (?<>'' AND replace(replace(replace(replace(replace(replace(phone,'+',''),' ',''),'-',''),'(',''),')',''),'.','')=?) OR (?<>'' AND lower(trim(email))=?))").bind(expected,c.name,c.whatsapp,c.email,c.country,c.source||'本地工作台',c.createdAt,owner,person?.name||'',c.grade,/^\d{4}-\d{2}-\d{2}$/.test(c.nextContact)?c.nextContact:'',detail,fingerprint,p||e?0:1,created,p,p,e,e),db.prepare('INSERT OR IGNORE INTO crm_workbench_links(lead_id,owner_id,desktop_id,created,created_by) SELECT id,owner_id,?,?,? FROM crm_leads WHERE id=? AND owner_id=?').bind(desktop,stamp,owner,expected,owner)]);
   lead=await db.prepare('SELECT id,owner_id,phone,email,fingerprint FROM crm_leads WHERE id=? AND owner_id=?').bind(expected,owner).first();
   if(!lead){reject('联系方式刚被其他客资使用，请核对后再同步');continue;}
   contacts.push(lead);
  }else await db.prepare('INSERT OR IGNORE INTO crm_workbench_links(lead_id,owner_id,desktop_id,created,created_by) SELECT id,owner_id,?,?,? FROM crm_leads WHERE id=? AND owner_id=?').bind(desktop,now(),owner,lead.id,owner).run();
  const confirmed:any=await db.prepare('SELECT w.lead_id,l.owner_id FROM crm_workbench_links w JOIN crm_leads l ON l.id=w.lead_id WHERE w.owner_id=? AND w.desktop_id=?').bind(owner,desktop).first();
  if(!confirmed||confirmed.lead_id!==lead.id||confirmed.owner_id!==owner){reject('客资归属或关联已变化，未继续同步');continue;}
  uploaded.push({desktop_id:desktop,lead_id:lead.id,created:lead.id===expected&&lead.fingerprint.startsWith('workbench:')});
  if(!links.some(l=>l.lead_id===lead.id))links.push({lead_id:lead.id,owner_id:owner,desktop_id:desktop});
 }
 return {uploaded,conflicts};
}
async function synchronizeWorkbench(db:D1Database,owner:string,input:any){
 if(!input||!Array.isArray(input.clients)||input.clients.length>5000||!Array.isArray(input.bindings)||input.bindings.length>5000||JSON.stringify(input).length>1400000)throw new AllocationError('本地同步资料过大或格式无效');
 const seen=new Set<string>(),clients=input.clients.map((c:any)=>{
  if(typeof c.id!=='string'||!/^[-a-zA-Z0-9_:]{1,150}$/.test(c.id)||seen.has(c.id)||!Array.isArray(c.messages)||c.messages.length>80)throw new AllocationError('本地客户编号或会话格式无效');seen.add(c.id);
  const out:any={id:c.id,messages:c.messages.map((m:any)=>({channel:clean(m.channel,30),timestamp:clean(m.timestamp,50),speaker:clean(m.speaker,200),text:clean(m.text,4000),key:clean(m.key,300),outgoing:m.outgoing===true}))};
  for(const key of ['name','country','whatsapp','email','grade','project','stage','projectStatus','source','customerType','nextAction','nextContact','followStatus','closeDate','amount','lostReason','notes','revision','createdAt','lastContact','contact','organization','city','role','currency'])out[key]=clean(c[key],['notes','nextAction','lostReason'].includes(key)?6000:500);
  out.stage=Number(out.stage)||1;out.phone=out.whatsapp;return out;
 });
 const imported=await uploadNewWorkbenchClients(db,owner,clients,input.new_clients,input.catalog_only===true);
 const rows=input.catalog_only===true?[]:(await db.prepare('SELECT * FROM crm_leads WHERE owner_id=?').bind(owner).all<any>()).results;
 const allLinks=(await db.prepare('SELECT w.*,l.owner_id AS current_owner FROM crm_workbench_links w JOIN crm_leads l ON l.id=w.lead_id WHERE w.owner_id=? OR l.owner_id=?').bind(owner,owner).all<any>()).results;
 const conflicts:any[]=[...imported.conflicts],updates:any[]=[],bindings:any[]=[],blocked=new Set(allLinks.filter(l=>l.current_owner!==owner||l.owner_id!==owner).map(l=>l.desktop_id));
 const used=new Set<string>();
 for(const client of clients.filter((c:any)=>/^[A-Z]{2}\d{8}(?:-\d+)?$/.test(c.id))){const link=allLinks.find(l=>l.desktop_id===client.id&&l.owner_id===owner&&l.current_owner===owner),lead=link&&rows.find(l=>l.id===link.lead_id);if(lead)await ensureCustomerCode(db,lead,client.id);}
 for(const lead of rows){
  const existing=allLinks.find(l=>l.lead_id===lead.id);
  if(existing&&existing.owner_id!==owner){conflicts.push({lead_id:lead.id,reason:'原沟通归属需要核对'});continue;}
  let client=existing?clients.find((c:any)=>c.id===existing.desktop_id):undefined;
  if(existing&&!client){conflicts.push({lead_id:lead.id,desktop_id:existing.desktop_id,reason:'原会话未在本次资料内，未另建客户'});continue;}
  const report=input.bindings.find((b:any)=>b.lead_id===lead.id);
  if(!client&&!existing){
   const p=phoneKey(lead.phone),e=emailKey(lead.email);
   const matched=clients.filter((c:any)=>!blocked.has(c.id)&&((p&&phoneKey(c.whatsapp)===p)||(e&&emailKey(c.email)===e)||c.id==='crm-'+lead.id));
   const remoteDuplicates=rows.filter((l:any)=>l.id!==lead.id&&((p&&phoneKey(l.phone)===p)||(e&&emailKey(l.email)===e)));
   if(matched.length>1||remoteDuplicates.length){conflicts.push({lead_id:lead.id,reason:'电话或邮箱对应多个客户，请核对后关联'});continue;}
   client=matched[0];
   if(client&&(used.has(client.id)||allLinks.some(l=>l.desktop_id===client.id))){conflicts.push({lead_id:lead.id,reason:'会话已有关联，请核对'});continue;}
   if(client){await db.prepare('INSERT OR IGNORE INTO crm_workbench_links(lead_id,owner_id,desktop_id,created,created_by) SELECT id,owner_id,?,?,? FROM crm_leads WHERE id=? AND owner_id=?').bind(client.id,now(),owner,lead.id,owner).run();}
  }
  if(client){const confirmed:any=await db.prepare('SELECT owner_id,desktop_id FROM crm_workbench_links WHERE lead_id=?').bind(lead.id).first();if(!confirmed||confirmed.owner_id!==owner||confirmed.desktop_id!==client.id){conflicts.push({lead_id:lead.id,reason:'关联刚被修改，请重新核对'});continue;}used.add(client.id);}
  const values:any={},base=report?.desktop_id===client?.id?report?.base:null;
  for(const [key,column] of Object.entries(fields)){
   const remote=String(lead[column]||''),local=String(client?.[key]||'');values[key]=remote;
   if(!client)continue;
   if(base&&typeof base[key]==='string'){
    if(local!==base[key]&&remote!==base[key]&&local!==remote){conflicts.push({lead_id:lead.id,desktop_id:client.id,field:key,local,remote,reason:'两端均已修改，请核对'});continue;}
    if(local!==base[key]&&remote===base[key]){
     if(key==='name'&&!local||key==='grade'&&local&&!CONTACT_GRADES.includes(local)||key==='nextContact'&&local&&!/^\d{4}-\d{2}-\d{2}$/.test(local)){conflicts.push({lead_id:lead.id,field:key,reason:'本地字段需核对'});continue;}
     if(['whatsapp','email'].includes(key)&&local&&(await db.prepare('SELECT id,phone,email FROM crm_leads WHERE id<>?').bind(lead.id).all<any>()).results.some(r=>key==='whatsapp'?phoneKey(r.phone)===phoneKey(local):emailKey(r.email)===emailKey(local))){conflicts.push({lead_id:lead.id,field:key,reason:'电话或邮箱重复，请核对'});continue;}
     const changed:any=await db.prepare(`UPDATE crm_leads SET ${column}=? WHERE id=? AND owner_id=? AND ${column}=? RETURNING id`).bind(local,lead.id,owner,remote).first();
     if(changed){values[key]=local;lead[column]=local;if(key==='grade')await cancelColleagueFirstContacts(db,lead.id).run();}else conflicts.push({lead_id:lead.id,field:key,reason:'CRM资料刚被修改，已保留两端内容'});
    }
   }else if(local&&remote&&local!==remote){conflicts.push({lead_id:lead.id,desktop_id:client.id,field:key,local,remote,reason:'首次关联的两端内容不同，请核对'});}
  }
  const profile=customerProfile(lead);
  for(const key of ['project','stage','projectStatus','customerType','nextAction','followStatus','closeDate','amount','lostReason','notes','contact','organization','city','role','currency']){
   const remote=key==='stage'?String(Number(profile.stage)||1):String((profile as any)[key]||''),local=String(client?.[key]??'');values[key]=key==='stage'?Number(remote):remote;
   if(!client)continue;
   if((base&&typeof base[key]!=='undefined'&&local!==String(base[key])&&remote===String(base[key]))||(!remote&&!!local)){
    try{validateCustomerProfile({[key]:local});}catch{conflicts.push({lead_id:lead.id,desktop_id:client.id,field:key,reason:'本地档案字段需核对'});continue;}
    const changed:any=await db.prepare("UPDATE crm_leads SET detail=json_set(detail,?,?,'$._profile_revision',COALESCE(json_extract(detail,'$._profile_revision'),0)+1) WHERE id=? AND owner_id=? AND detail=? RETURNING detail").bind('$._customer_profile.'+key,local,lead.id,owner,lead.detail).first();
    if(changed){lead.detail=changed.detail;values[key]=key==='stage'?(Number(local)||1):local;}else conflicts.push({lead_id:lead.id,desktop_id:client.id,field:key,reason:'CRM档案刚被修改'});
   }else if(local!==remote&&local&&(base?remote!==String(base[key]??''):remote!==''))conflicts.push({lead_id:lead.id,desktop_id:client.id,field:key,reason:'档案两端内容待核对'});
  }
  const customerCode=await ensureCustomerCode(db,lead,client?.id);
  updates.push({customerCode,lead_id:lead.id,desktop_id:client?.id||'crm-'+lead.id,create:!client,values,source:lead.source,detail:lead.detail});
  if(client)bindings.push({lead_id:lead.id,desktop_id:client.id});
 }
 // A transfer during this request must not expose or update the previous owner's conversation.
 const current=(await db.prepare('SELECT id FROM crm_leads WHERE owner_id=?').bind(owner).all<any>()).results;
 const allowed=new Set(current.map(l=>l.id));
 const latestLinks=(await db.prepare('SELECT w.desktop_id,l.owner_id FROM crm_workbench_links w JOIN crm_leads l ON l.id=w.lead_id WHERE w.owner_id=?').bind(owner).all<any>()).results;
 for(const link of latestLinks)if(link.owner_id!==owner)blocked.add(link.desktop_id);
 const previous:any=await db.prepare('SELECT payload FROM crm_workbench_snapshots WHERE owner_id=?').bind(owner).first();
 const snapshot=previous?await readJson(previous.payload):{format:'yifun-workbench-v1',clients:[],scenes:[]};
 const before=JSON.stringify({...snapshot,captured_at:undefined});
 if(input.full_history===true)await db.prepare("INSERT OR IGNORE INTO crm_workbench_history_progress(owner_id,desktop_id,revision,total,received,complete,updated) SELECT ?,value,'',0,0,0,? FROM json_each(?)").bind(owner,now(),JSON.stringify(clients.filter((c:any)=>!blocked.has(c.id)).map((c:any)=>c.id))).run();
 for(const client of clients.filter((c:any)=>!blocked.has(c.id))){const prior=snapshot.clients.find((c:any)=>c.id===client.id);if(prior){const messages=new Map();for(const m of [...(prior.messages||[]),...client.messages])messages.set(m.key||JSON.stringify([m.channel,m.timestamp,m.speaker,m.text]),m);Object.assign(prior,client,{messages:[...messages.values()].slice(-80)});}else snapshot.clients.push(client);}
 snapshot.clients=snapshot.clients.filter((c:any)=>!blocked.has(c.id));snapshot.captured_at=now();
 snapshot.scenes=(input.scenes||[]).slice(0,300).map((s:any)=>({id:clean(s.id,150),name:clean(s.name,200),category:clean(s.category,40),reply:clean(s.reply,2000)}));
 if(!previous||before!==JSON.stringify({...snapshot,captured_at:undefined}))await db.prepare('INSERT INTO crm_workbench_snapshots(owner_id,payload,updated,updated_by) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET payload=excluded.payload,updated=excluded.updated,updated_by=excluded.updated_by').bind(owner,await storeJson(snapshot,`snapshots/${owner}`,true),now(),owner).run();
 return {owner_id:owner,updates:updates.filter(u=>allowed.has(u.lead_id)),bindings:bindings.filter(b=>allowed.has(b.lead_id)),uploaded:imported.uploaded.filter(u=>allowed.has(u.lead_id)),blocked:[...blocked],conflicts};
}

async function synchronizeHistory(db:D1Database,owner:string,input:any){
 const {desktop_id:desktop,revision,total,offset,messages}=input||{};
 if(typeof desktop!=='string'||!/^[-a-zA-Z0-9_:]{1,150}$/.test(desktop)||!/^\w{64}$/.test(revision||'')||!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(offset)||offset<0||!Array.isArray(messages)||messages.length>50||offset+messages.length>total||JSON.stringify(input).length>4500000)throw new AllocationError('聊天同步批次格式无效');
 await ownedDesktop(db,owner,desktop);
 const progress:any=await db.prepare('SELECT * FROM crm_workbench_history_progress WHERE owner_id=? AND desktop_id=?').bind(owner,desktop).first();
 if(offset&&(!progress||progress.revision!==revision||offset>progress.received))throw new AllocationError('聊天同步进度已变化，请从头核对；已保存的记录保留',409);
 const keys=new Set<string>(),entries:any[]=[],plans:any[]=[];
 for(let i=0;i<messages.length;i++){
  const entry=messages[i],m=entry?.value;
  if(!m||typeof m!=='object'||Array.isArray(m)||Object.hasOwn(m,'$r2')||typeof m.key!=='string'||!m.key||typeof m.text!=='string'||typeof m.channel!=='string'||typeof m.timestamp!=='string'||!Number.isFinite(entry.sort_time))throw new AllocationError('聊天记录缺少稳定编号、时间或全文');
  const key=await digest(m.key),hash=await digest(JSON.stringify(m));if(keys.has(key))throw new AllocationError('批次含重复消息编号');keys.add(key);
  entries.push({m,key,hash,sort_time:entry.sort_time,index:offset+i});
 }
 const previous=entries.length?(await db.prepare(`SELECT message_key,content_hash,payload FROM crm_workbench_history WHERE owner_id=? AND desktop_id=? AND message_key IN (${entries.map(()=>'?').join(',')})`).bind(owner,desktop,...entries.map(e=>e.key)).all<any>()).results:[];
 const existing=new Map(previous.map(row=>[row.message_key,row]));
 for(const {m,key,hash,sort_time,index} of entries){
  const prior=existing.get(key),payload=prior?.content_hash===hash?prior.payload:await storeJson(m,`history/${owner}/${desktop}`);
  plans.push(db.prepare('INSERT INTO crm_workbench_history(owner_id,desktop_id,message_key,content_hash,channel,sort_time,source_index,revision,payload,updated) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,desktop_id,message_key) DO UPDATE SET content_hash=excluded.content_hash,channel=excluded.channel,sort_time=excluded.sort_time,source_index=excluded.source_index,revision=excluded.revision,payload=excluded.payload,updated=excluded.updated').bind(owner,desktop,key,hash,clean(m.channel,30),sort_time,index,revision,payload,now()));
 }
 // Check the customer again after object uploads and before publishing their messages.
 await ownedDesktop(db,owner,desktop);
 if(plans.length)await db.batch(plans);
 const received=Math.max(progress?.revision===revision?progress.received:0,offset+messages.length);
 await db.prepare('INSERT INTO crm_workbench_history_progress(owner_id,desktop_id,revision,total,received,complete,updated) VALUES(?,?,?,?,?,0,?) ON CONFLICT(owner_id,desktop_id) DO UPDATE SET revision=excluded.revision,total=excluded.total,received=excluded.received,complete=0,updated=excluded.updated').bind(owner,desktop,revision,total,received,now()).run();
 let complete=false;
 if(received===total){
  const manifest=(await db.prepare('SELECT message_key,content_hash FROM crm_workbench_history WHERE owner_id=? AND desktop_id=? AND revision=? ORDER BY source_index').bind(owner,desktop,revision).all<any>()).results;
  complete=manifest.length===total&&await digest(JSON.stringify(manifest.map(m=>[m.message_key,m.content_hash])))===revision;
  if(!complete)throw new AllocationError('聊天数量或校验不一致，已保存部分可继续核对，不会标为完整',409);
 }
 if(complete)await db.prepare('UPDATE crm_workbench_history_progress SET complete=1 WHERE owner_id=? AND desktop_id=? AND revision=?').bind(owner,desktop,revision).run();
 return {owner_id:owner,desktop_id:desktop,revision,received,total,complete};
}

async function synchronizeContactReceipts(db:D1Database,owner:string,rows:any){
 if(!Array.isArray(rows)||rows.length>50)throw new AllocationError('联系回执批次无效');
 const confirmed=[];
 for(const r of rows){
  if(!r||typeof r.requestId!=='string'||!/^[-a-zA-Z0-9_:]{1,150}$/.test(r.requestId)||!['whatsapp','email'].includes(r.channel)||r.status!=='sent'||typeof r.confirmation!=='string'||!r.confirmation||!Number.isFinite(Date.parse(r.confirmedAt))||Date.parse(r.confirmedAt)>Date.now())throw new AllocationError('联系回执未经确认');
  await ownedDesktop(db,owner,r.clientId);
  const lead:any=await db.prepare('SELECT l.* FROM crm_workbench_links w JOIN crm_leads l ON l.id=w.lead_id WHERE w.owner_id=? AND w.desktop_id=? AND l.owner_id=?').bind(owner,r.clientId,owner).first();
  if(!lead)throw new AllocationError('联系回执客户未关联');
  const actual=String(r.channel==='email'?lead.email:lead.phone).toLowerCase().replace(r.channel==='email'?/^$/g:/\D/g,''),target=String(r.recipient||'').toLowerCase().replace(r.channel==='email'?/^$/g:/\D/g,'');
  if(!actual||actual!==target)throw new AllocationError('回执收件人与CRM不符');
  await recordOnlineContact(db,owner,r.clientId,'receipt:'+r.requestId,r.channel,r.confirmation,false,Date.parse(r.confirmedAt));
  confirmed.push(r.requestId);
 }
 return {owner_id:owner,confirmed};
}
