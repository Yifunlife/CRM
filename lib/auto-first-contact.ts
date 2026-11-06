import {backfillReady,intakeDay,todayAssignmentSQL} from './auto-contact-intake';
import {wonCustomerSQL} from './auto-contact-exclusions';
export {wonCustomerSQL};
import {customerLeadSQL} from './contact-kind';
import {digest,emailKey,phoneKey} from './crm';
import {contactFollowups} from './contact-followup-server';
import {contactQuota,contactLimit} from './auto-contact-quota';

export const autoContactKey=(owner:string)=>'auto-first-contact:'+owner;
export function preferredContact(detail:string){
 let values:Record<string,unknown>={};try{values=JSON.parse(detail||'{}');}catch{}
 const answers=Object.entries(values).filter(([key])=>['偏好联系方式','联系方式偏好','which_method_would_you_prefer_to_be_contacted_by?','which method do you prefer for us to contact you?'].includes(key)).map(([,value])=>String(value).trim().toLowerCase().replace(/[ _-]/g,''));
 const channels=new Set(answers.map(v=>['email','byemail','邮件','邮箱'].includes(v)?'email':['whatsapp','bywhatsapp'].includes(v)?'whatsapp':'').filter(Boolean));
 return channels.size===1?[...channels][0]:'';
}
async function configFor(db:D1Database,owner:string){
 const row=await db.prepare('SELECT value FROM crm_cloud_settings WHERE id=?').bind(autoContactKey(owner)).first<{value:string}>();
 if(!row)return null;
 const config=JSON.parse(row.value);
 return config.enabled===true&&Number.isFinite(Date.parse(config.assigned_from))&&Array.isArray(config.options)&&config.options.length===3&&config.options.every((s:any)=>typeof s==='string'&&s.trim()&&s.length<=2000)?config:null;
}
const policies="('full-first-v1','manual-v1','equal-v1','equal-global-v1')";
const phoneFailures=new Set(['国家或号码格式尚不能可靠核对','号码位数异常或与表单国家冲突','号码国际格式待核实']);
function whatsappNotSent(job:any,lead:any){
 try{
  const payload=JSON.parse(job.payload),result=JSON.parse(job.result);
  if(payload.channel!=='whatsapp'||payload.name!==lead.name||payload.country!==lead.country||payload.recipient_key!==phoneKey(lead.phone))return false;
  return job.state==='failed'&&phoneFailures.has(result.error)||job.state==='done'&&['not_sent','confirmed_not_sent'].includes(result.status);
 }catch{return false;}
}
async function priorContacts(db:D1Database,owner:string,lead:string){
 return (await db.prepare("SELECT state,result,payload FROM crm_workbench_commands WHERE owner_id=? AND json_extract(payload,'$.auto_first_contact')=1 AND json_extract(payload,'$.crm_lead_id')=?").bind(owner,lead).all<any>()).results;
}
function fallbackAllowed(config:any,lead:any,prior:any[]){
 return config.whatsapp_fallback_email===true&&preferredContact(lead.detail)==='whatsapp'&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(emailKey(lead.email))&&prior.some(job=>whatsappNotSent(job,lead));
}
export async function autoContactAllowed(db:D1Database,owner:string,payload:any){
 const config=await configFor(db,owner);if(!config)return false;
 if(payload.auto_followup_24h)return followupAllowed(db,owner,payload,config);
 if(payload.auto_historical_first_contact)return historicalContactAllowed(db,owner,payload,config);
 const lead:any=await db.prepare(`SELECT l.* FROM crm_leads l WHERE ${customerLeadSQL()} AND l.id=? AND l.owner_id=? AND l.review=0 AND NOT ${wonCustomerSQL()} AND l.status='待首次联系' AND l.last_contact='' AND COALESCE(json_extract(l.detail,'$._contact_verified.first_at'),'')='' AND NOT EXISTS(SELECT 1 FROM crm_workbench_drafts d WHERE d.lead_id=l.id AND d.owner_id=l.owner_id AND trim(d.content)<>'') AND EXISTS(SELECT 1 FROM crm_assignments a WHERE a.lead_id=l.id AND a.owner_id=l.owner_id AND a.id=? AND l.cohort<>'historical' AND a.created>=? AND a.policy IN ${policies})`).bind(payload.crm_lead_id,owner,payload.assignment_id,config.assigned_from).first();
 if(!lead)return false;
 if((await contactFollowups(db,owner,[lead],new Date().toISOString())).some(r=>r.first_at))return false;
 const matchingChannel=payload.fallback_from==='whatsapp'&&payload.channel==='email'?fallbackAllowed(config,lead,await priorContacts(db,owner,lead.id)):!payload.fallback_from&&preferredContact(lead.detail)===payload.channel;
 return matchingChannel&&lead.name===payload.name&&lead.country===payload.country&&(payload.channel==='email'?emailKey(lead.email):phoneKey(lead.phone))===payload.recipient_key;
}
export async function queueFirstContacts(db:D1Database,owner:string,at=new Date().toISOString()){
 const config=await configFor(db,owner);if(!config)return;
 const connection:any=await db.prepare('SELECT seen,status FROM crm_workbench_bridge WHERE owner_id=?').bind(owner).first();
 if(!connection||Date.now()-connection.seen>=30000)return;
 const status=JSON.parse(connection.status||'{}');if(status.autoFirstContact!==true)return;
 const strict=config.wait_for_daily_intake===true,day=intakeDay(at);
 const allCurrent=(await db.prepare(`SELECT l.*,w.desktop_id,a.id AS assignment_id,a.created AS assigned_at FROM crm_leads l JOIN crm_workbench_links w ON w.lead_id=l.id AND w.owner_id=l.owner_id JOIN crm_assignments a ON a.lead_id=l.id AND a.owner_id=l.owner_id WHERE ${customerLeadSQL()} AND l.owner_id=? AND l.review=0 AND NOT ${wonCustomerSQL()} AND l.status='待首次联系' AND l.last_contact='' AND COALESCE(json_extract(l.detail,'$._contact_verified.first_at'),'')='' AND NOT EXISTS(SELECT 1 FROM crm_workbench_drafts d WHERE d.lead_id=l.id AND d.owner_id=l.owner_id AND trim(d.content)<>'') AND l.cohort<>'historical' AND a.created>=? AND a.policy IN ${policies} ORDER BY a.created,l.id LIMIT 100`).bind(owner,config.assigned_from).all<any>()).results;
 const batch=config.historical_first_contact;
 const current=strict?allCurrent.filter(l=>l.assigned_at>=day.start):allCurrent;
 const carried=strict?allCurrent.filter(l=>l.assigned_at<day.start):[];
 const approvedHistorical=batch&&status.autoHistoricalFirstContact===true&&Array.isArray(batch.lead_ids)&&Number.isFinite(Date.parse(batch.approved_at))?(await db.prepare(`SELECT l.*,w.desktop_id FROM crm_leads l JOIN crm_workbench_links w ON w.lead_id=l.id AND w.owner_id=l.owner_id WHERE ${customerLeadSQL()} AND l.owner_id=? AND l.id IN (SELECT value FROM json_each(?)) AND l.review=0 AND NOT ${wonCustomerSQL()} AND l.status='待首次联系' AND l.last_contact='' AND COALESCE(json_extract(l.detail,'$._contact_verified.first_at'),'')='' AND NOT EXISTS(SELECT 1 FROM crm_workbench_drafts d WHERE d.lead_id=l.id AND d.owner_id=l.owner_id AND trim(d.content)<>'')`).bind(owner,JSON.stringify(batch.lead_ids)).all<any>()).results.map(l=>({...l,historical_approved_at:batch.approved_at})):[];
 const historical=[...carried,...approvedHistorical];
 const rows=[...current,...historical.filter(l=>!current.some(c=>c.id===l.id))];
 const alreadyContacted=new Set((await contactFollowups(db,owner,rows,at)).filter(r=>r.first_at).map(r=>r.id));
 if(strict){
  const tried=new Set((await db.prepare("SELECT DISTINCT json_extract(payload,'$.crm_lead_id') lead_id FROM crm_workbench_commands WHERE owner_id=? AND json_extract(payload,'$.auto_first_contact')=1").bind(owner).all<any>()).results.map(c=>c.lead_id));
  const freshWaiting=current.some(l=>!alreadyContacted.has(l.id)&&!tried.has(l.id)&&preferredContact(l.detail)&&!!l[preferredContact(l.detail)==='email'?'email':'phone']);
  if(freshWaiting||!await backfillReady(db,owner,at))await db.prepare(`UPDATE crm_workbench_commands SET state='deferred',result=?,updated=? WHERE owner_id=? AND state='queued' AND json_extract(payload,'$.auto_first_contact')=1 AND NOT EXISTS(SELECT 1 FROM crm_assignments a WHERE a.lead_id=json_extract(crm_workbench_commands.payload,'$.crm_lead_id') AND a.owner_id=crm_workbench_commands.owner_id AND a.created>=?)`).bind(JSON.stringify({status:'deferred',detail:'先处理当天新增客资，历史任务等待补量条件'}),Date.parse(at),owner,day.start).run();
 }
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 const counts=(await db.prepare("SELECT json_extract(payload,'$.option') AS option,COUNT(*) AS n FROM crm_workbench_commands WHERE owner_id=? AND json_extract(payload,'$.auto_first_contact')=1 AND json_extract(payload,'$.channel')='whatsapp' AND date(created/1000,'unixepoch','+8 hours')=? GROUP BY option").bind(owner,today).all<any>()).results;
 const slots=config.options.map((_:string,i:number)=>counts.find((r:any)=>r.option===i)?.n||0);
 let queued=(await db.prepare("SELECT COUNT(*) AS n FROM crm_workbench_commands WHERE owner_id=? AND state IN ('queued','running')").bind(owner).first<{n:number}>())!.n;
 const followups=async(fresh:boolean)=>{if(config.followup_24h===true&&status.autoFollowup24h===true)await queueFollowups(db,owner,config,status,at,fresh);};
 for(const group of [current,historical]){
 if(group===historical&&strict){if(!await backfillReady(db,owner,at))continue;await resumeBackfill(db,owner,config,at);}
 for(const lead of group){
  if(alreadyContacted.has(lead.id))continue;
  if(queued>=20)break;
  const prior=await priorContacts(db,owner,lead.id);
  const fallback=fallbackAllowed(config,lead,prior);
  const channel=fallback?'email':preferredContact(lead.detail);if(!channel||!status[channel])continue;
  const recipient=channel==='email'?emailKey(lead.email):phoneKey(lead.phone);if(!recipient)continue;
  if(prior.some(job=>{if(fallback)return !whatsappNotSent(job,lead);if(job.state!=='failed')return true;try{const error=JSON.parse(job.result).error;return !phoneFailures.has(error)&&error!=='请配置已批准的压缩公司介绍PDF';}catch{return true;}}))continue;
  const commandId='first-'+channel+'-'+await digest(owner+':'+lead.id+':'+lead.country+':'+recipient);
  if(await db.prepare('SELECT id FROM crm_workbench_commands WHERE id=?').bind(commandId).first())continue;
  if(await db.prepare("SELECT id FROM crm_workbench_commands WHERE owner_id=? AND desktop_id=? AND kind IN ('send','material') AND state IN ('queued','running','uncertain')").bind(owner,lead.desktop_id).first())continue;
  const option=channel==='whatsapp'?(config.whatsapp_daily_limit===20?slots.indexOf(Math.min(...slots)):slots.findIndex((n:number)=>n<5)):-1;if(channel==='whatsapp'&&option<0)continue;
  const quota=contactQuota(owner,channel,at);
  const payload={auto_first_contact:true,...(lead.historical_approved_at?{auto_historical_first_contact:true,historical_approved_at:lead.historical_approved_at,command_id:commandId}:{}),crm_lead_id:lead.id,assignment_id:lead.assignment_id||'',assigned_at:lead.assigned_at||'',name:lead.name,country:lead.country,recipient_key:recipient,channel,option,...(fallback?{fallback_from:'whatsapp'}:{}),text:channel==='whatsapp'?config.options[option]:'自动首次联系邮件：沿用已批准原模板、签名与压缩公司资料',include_materials:false,keep_desktop_draft:false};
  if(lead.historical_approved_at&&!await historicalContactAllowed(db,owner,payload,config))continue;
  const timestamp=Date.now();
  const inserted=await db.prepare(`INSERT OR IGNORE INTO crm_workbench_commands(id,owner_id,desktop_id,kind,payload,state,created,updated,actor_id) SELECT ?,?,?,'send',?,'queued',?,?,? WHERE EXISTS(SELECT 1 FROM crm_leads l WHERE l.id=? AND l.owner_id=? AND NOT ${wonCustomerSQL()} AND COALESCE(grade,'') NOT IN ('Yifun Staff','同事') AND status='待首次联系' AND last_contact='' AND COALESCE(json_extract(detail,'$._contact_verified.first_at'),'')='') AND (${quota.sql})<?`).bind(commandId,owner,lead.desktop_id,JSON.stringify(payload),timestamp,timestamp,owner,lead.id,owner,...quota.args,contactLimit(config,channel,at,lead.id)).run();
  if(inserted.meta.changes){if(option>=0)slots[option]++;queued++;}
 }
 await followups(group===current);
 queued=(await db.prepare("SELECT COUNT(*) AS n FROM crm_workbench_commands WHERE owner_id=? AND state IN ('queued','running')").bind(owner).first<{n:number}>())!.n;
 }
}


async function historicalContactAllowed(db:D1Database,owner:string,p:any,config:any){
 const batch=config.historical_first_contact;
 if(!batch||!Array.isArray(batch.lead_ids)||!batch.lead_ids.includes(p.crm_lead_id)||batch.approved_at!==p.historical_approved_at||!Number.isFinite(Date.parse(batch.approved_at)))return false;
 const lead:any=await db.prepare(`SELECT l.* FROM crm_leads l WHERE ${customerLeadSQL()} AND l.id=? AND l.owner_id=? AND l.review=0 AND NOT ${wonCustomerSQL()} AND l.status='待首次联系' AND l.last_contact='' AND COALESCE(json_extract(l.detail,'$._contact_verified.first_at'),'')='' AND NOT EXISTS(SELECT 1 FROM crm_workbench_drafts d WHERE d.lead_id=l.id AND d.owner_id=l.owner_id AND trim(d.content)<>'')`).bind(p.crm_lead_id,owner).first();
 if(lead&&JSON.parse(lead.detail||'{}')._contact_plan?.state&&!['ready','waiting'].includes(JSON.parse(lead.detail||'{}')._contact_plan.state))return false;
 if(!lead||lead.name!==p.name||lead.country!==p.country||preferredContact(lead.detail)!==p.channel||(p.channel==='email'?emailKey(lead.email):phoneKey(lead.phone))!==p.recipient_key)return false;
 const reminders=await contactFollowups(db,owner,[{...lead,cohort:'new'}],new Date().toISOString(),p.command_id);
 return reminders.some(r=>r.kind==='first');
}

async function followupAllowed(db:D1Database,owner:string,p:any,config:any){
 if(config.followup_24h!==true)return false;
 const lead:any=await db.prepare(`SELECT l.* FROM crm_leads l WHERE ${customerLeadSQL()} AND l.id=? AND l.owner_id=? AND l.review=0 AND NOT ${wonCustomerSQL()}`).bind(p.crm_lead_id,owner).first();
 if(lead&&JSON.parse(lead.detail||'{}')._contact_plan?.state&&!['ready','waiting'].includes(JSON.parse(lead.detail||'{}')._contact_plan.state))return false;
 if(!lead||lead.name!==p.name||lead.country!==p.country||(p.channel==='email'?emailKey(lead.email):phoneKey(lead.phone))!==p.recipient_key)return false;
 if(await db.prepare("SELECT id FROM crm_workbench_drafts WHERE lead_id=? AND owner_id=? AND trim(content)<>''").bind(lead.id,owner).first())return false;
 const rows=await contactFollowups(db,owner,[lead],new Date().toISOString(),p.command_id,true);
 return rows.some(r=>r.kind==='alternate'&&r.actionable&&r.alternate===p.channel&&r.first_at===p.first_at);
}
async function queueFollowups(db:D1Database,owner:string,config:any,status:any,at:string,fresh:boolean){
 const leads=(await db.prepare(`SELECT l.*,w.desktop_id FROM crm_leads l JOIN crm_workbench_links w ON w.lead_id=l.id AND w.owner_id=l.owner_id WHERE ${customerLeadSQL()} AND l.owner_id=? AND l.review=0 AND l.status='已联系待回复' AND ${config.wait_for_daily_intake?(fresh?todayAssignmentSQL(intakeDay(at).start):'NOT '+todayAssignmentSQL(intakeDay(at).start)):(fresh?"l.cohort='new'":"l.cohort<>'new'")} AND (json_extract(l.detail,'$._contact_plan.state') IS NULL OR json_extract(l.detail,'$._contact_plan.state') IN ('ready','waiting')) AND NOT ${wonCustomerSQL()} AND NOT EXISTS(SELECT 1 FROM crm_workbench_drafts d WHERE d.lead_id=l.id AND d.owner_id=l.owner_id AND trim(d.content)<>'')`).bind(owner).all<any>()).results;
 const reminders=await contactFollowups(db,owner,leads,at,'',true);
 const existing=(await db.prepare("SELECT id,desktop_id,state FROM crm_workbench_commands WHERE owner_id=? AND kind IN ('send','material')").bind(owner).all<any>()).results;
 const commandIds=new Set(existing.map(c=>c.id)),blocked=new Set(existing.filter(c=>['queued','running','uncertain'].includes(c.state)).map(c=>c.desktop_id));
 const remaining:Record<string,number>={};
 for(const channel of ['email','whatsapp']){const quota=contactQuota(owner,channel,at),count:any=await db.prepare(quota.sql).bind(...quota.args).first();remaining[channel]=contactLimit(config,channel)-Number(Object.values(count)[0]);}
 for(const r of reminders.filter(r=>r.kind==='alternate'&&r.actionable)){
  const lead=leads.find(l=>l.id===r.id)!,channel=r.alternate;
  if(!status[channel]||!status[r.preferred])continue;
  const commandId='followup24h-'+await digest(owner+':'+lead.id);
  if(commandIds.has(commandId)||blocked.has(lead.desktop_id))continue;
  const prior=JSON.parse(lead.detail||'{}')._auto_followup_24h;
  if(remaining[channel]<=0&&prior?.state==='quota'&&new Date(prior.at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})===new Date(at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}))continue;
  const recipient=channel==='email'?emailKey(lead.email):phoneKey(lead.phone),quota=contactQuota(owner,channel,at),timestamp=Date.parse(at);
  const p={auto_first_contact:true,auto_followup_24h:true,command_id:commandId,crm_lead_id:lead.id,name:lead.name,country:lead.country,recipient_key:recipient,channel,first_at:r.first_at,text:channel==='whatsapp'?config.options[0]:'24小时未回复自动邮件跟进：沿用已批准原模板、签名与压缩公司资料',include_materials:false,keep_desktop_draft:false};
  const result=remaining[channel]>0?await db.prepare("INSERT OR IGNORE INTO crm_workbench_commands(id,owner_id,desktop_id,kind,payload,state,created,updated,actor_id) SELECT ?,?,?,'send',?,'queued',?,?,? WHERE ("+quota.sql+")<?").bind(commandId,owner,lead.desktop_id,JSON.stringify(p),timestamp,timestamp,owner,...quota.args,contactLimit(config,channel)).run():{meta:{changes:0}};
  if(result.meta.changes){remaining[channel]--;commandIds.add(commandId);blocked.add(lead.desktop_id);}
  if(!result.meta.changes&&remaining[channel]>0&&await db.prepare('SELECT id FROM crm_workbench_commands WHERE id=?').bind(commandId).first())continue;
  const state=result.meta.changes?'queued':'quota',day=new Date(at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),key=result.meta.changes?commandId:commandId+':quota:'+day;
  await db.batch([
   db.prepare("UPDATE crm_leads SET detail=json_set(detail,'$._auto_followup_24h',json(?)) WHERE id=? AND owner_id=?").bind(JSON.stringify({command_id:commandId,state,channel,at}),lead.id,owner),
   db.prepare("INSERT OR IGNORE INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES(?,?,?,?,'自动跟进',?,?)").bind(key,lead.id,owner,result.meta.changes?'首次成功联系满24小时未回复，已安排通过'+(channel==='email'?'邮件':'WhatsApp')+'自动联系':'今日自动联系额度已满，顺延等待下一日额度，尚未发送',result.meta.changes?'等待实际发送回执':'下日有额度后自动安排',at)
  ]);
 }
}

export async function autoContactQuota(db:D1Database,owner:string,p:any,commandId:string){
 const config=await configFor(db,owner);if(!config)return true;
 const at=new Date().toISOString();
 if(config.wait_for_daily_intake){const day=intakeDay(at);const fresh=await db.prepare(`SELECT l.id FROM crm_leads l WHERE l.id=? AND l.owner_id=? AND ${todayAssignmentSQL(day.start)}`).bind(p.crm_lead_id,owner).first();if(!fresh&&!await backfillReady(db,owner,at))return false;}
 const quota=contactQuota(owner,p.channel,at,commandId);
 const row:any=await db.prepare(quota.sql).bind(...quota.args).first();
 return Number(Object.values(row)[0])<contactLimit(config,p.channel,at,p.crm_lead_id);
}
export async function recordAutoFollowupResult(db:D1Database,owner:string,command:any,state:string,value:any,at:string){
 const p=JSON.parse(command.payload),historical=p.auto_historical_first_contact===true;if(!p.auto_followup_24h&&!historical)return;
 const success=state==='done'&&['sent','confirmed_sent'].includes(value?.status)&&!!value.messageId;
 const sentAt=Number.isFinite(Date.parse(value?.sentAt))&&Date.parse(value.sentAt)<=Date.parse(at)?new Date(value.sentAt).toISOString():at;
 const nextAt=success?new Date(Date.parse(sentAt)+(historical?1:7)*86400000).toISOString():'';
 const nextDate=nextAt?new Date(nextAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}):'';
 const detail=JSON.stringify({command_id:command.id,state:success?'sent':state==='done'?value.status:state,channel:p.channel,at,...(success?{sent_at:sentAt,next_at:nextAt}:{reason:value?.error||value?.detail||'发送结果待核实'})});
 const label=historical?'历史客资首次联系':'24小时自动跟进';
 const text=success?label+'已通过'+(p.channel==='email'?'邮件':'WhatsApp')+(historical?'确认发送；24小时未回复后使用另一种方式联系。凭据：':'确认发送；如仍未回复，安排7天后再联系。凭据：')+value.messageId:label+(state==='done'?'已跳过':state==='uncertain'?'结果待核实':'未完成')+'：'+(value?.error||value?.detail||value?.status||'待核对');
 await db.batch([
  db.prepare("INSERT OR IGNORE INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) SELECT ?,id,?,?, '自动跟进',?,? FROM crm_leads WHERE id=? AND owner_id=?").bind(command.id+':result:'+state,owner,text,success?'未回复则于'+nextDate+(historical?'改用另一种方式联系':'再次联系'):'核对执行结果，不自动重发',at,p.crm_lead_id,owner),
  db.prepare("UPDATE crm_leads SET detail=json_set(detail,?,json(?)) WHERE id=? AND owner_id=?").bind(historical?'$._historical_first_contact':'$._auto_followup_24h',detail,p.crm_lead_id,owner)
 ]);
 if(success)await db.prepare("UPDATE crm_leads SET detail=json_set(detail,'$._sales_progress.auto_next_date',?,'$._sales_progress.version',COALESCE(json_extract(detail,'$._sales_progress.version'),0)+1),next_date=? WHERE id=? AND owner_id=? AND status='已联系待回复' AND (next_date='' OR next_date=COALESCE(json_extract(detail,'$._sales_progress.auto_next_date'),''))").bind(nextDate,nextDate,p.crm_lead_id,owner).run();
}

async function resumeBackfill(db:D1Database,owner:string,config:any,at:string){
 const jobs=(await db.prepare("SELECT * FROM crm_workbench_commands WHERE owner_id=? AND state='deferred' AND json_extract(payload,'$.auto_first_contact')=1 ORDER BY created,id LIMIT 30").bind(owner).all<any>()).results;
 for(const job of jobs){const p=JSON.parse(job.payload);if(!await autoContactAllowed(db,owner,p))continue;const quota=contactQuota(owner,p.channel,at);await db.prepare("UPDATE crm_workbench_commands SET state='queued',result='{}',updated=? WHERE id=? AND state='deferred' AND ("+quota.sql+")<?").bind(Date.parse(at),job.id,...quota.args,contactLimit(config,p.channel)).run();}
}
