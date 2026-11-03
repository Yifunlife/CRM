import {customerLeadSQL} from './contact-kind';
import {digest,emailKey,phoneKey} from './crm';

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
 const lead:any=await db.prepare(`SELECT l.* FROM crm_leads l WHERE ${customerLeadSQL()} AND l.id=? AND l.owner_id=? AND l.review=0 AND l.status='待首次联系' AND l.last_contact='' AND COALESCE(json_extract(l.detail,'$._contact_verified.first_at'),'')='' AND NOT EXISTS(SELECT 1 FROM crm_workbench_drafts d WHERE d.lead_id=l.id AND d.owner_id=l.owner_id AND trim(d.content)<>'') AND EXISTS(SELECT 1 FROM crm_assignments a WHERE a.lead_id=l.id AND a.owner_id=l.owner_id AND a.id=? AND a.created>=? AND a.policy IN ${policies})`).bind(payload.crm_lead_id,owner,payload.assignment_id,config.assigned_from).first();
 if(!lead)return false;
 const matchingChannel=payload.fallback_from==='whatsapp'&&payload.channel==='email'?fallbackAllowed(config,lead,await priorContacts(db,owner,lead.id)):!payload.fallback_from&&preferredContact(lead.detail)===payload.channel;
 return matchingChannel&&lead.name===payload.name&&lead.country===payload.country&&(payload.channel==='email'?emailKey(lead.email):phoneKey(lead.phone))===payload.recipient_key;
}
export async function queueFirstContacts(db:D1Database,owner:string){
 const config=await configFor(db,owner);if(!config)return;
 const connection:any=await db.prepare('SELECT seen,status FROM crm_workbench_bridge WHERE owner_id=?').bind(owner).first();
 if(!connection||Date.now()-connection.seen>=30000)return;
 const status=JSON.parse(connection.status||'{}');if(status.autoFirstContact!==true)return;
 const rows=(await db.prepare(`SELECT l.*,w.desktop_id,a.id AS assignment_id,a.created AS assigned_at FROM crm_leads l JOIN crm_workbench_links w ON w.lead_id=l.id AND w.owner_id=l.owner_id JOIN crm_assignments a ON a.lead_id=l.id AND a.owner_id=l.owner_id WHERE ${customerLeadSQL()} AND l.owner_id=? AND l.review=0 AND l.status='待首次联系' AND l.last_contact='' AND COALESCE(json_extract(l.detail,'$._contact_verified.first_at'),'')='' AND NOT EXISTS(SELECT 1 FROM crm_workbench_drafts d WHERE d.lead_id=l.id AND d.owner_id=l.owner_id AND trim(d.content)<>'') AND a.created>=? AND a.policy IN ${policies} ORDER BY a.created,l.id LIMIT 100`).bind(owner,config.assigned_from).all<any>()).results;
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 const counts=(await db.prepare("SELECT json_extract(payload,'$.option') AS option,COUNT(*) AS n FROM crm_workbench_commands WHERE owner_id=? AND json_extract(payload,'$.auto_first_contact')=1 AND json_extract(payload,'$.channel')='whatsapp' AND date(created/1000,'unixepoch','+8 hours')=? GROUP BY option").bind(owner,today).all<any>()).results;
 const slots=config.options.map((_:string,i:number)=>counts.find((r:any)=>r.option===i)?.n||0);
 let queued=(await db.prepare("SELECT COUNT(*) AS n FROM crm_workbench_commands WHERE owner_id=? AND state IN ('queued','running')").bind(owner).first<{n:number}>())!.n;
 for(const lead of rows){
  if(queued>=20)break;
  const prior=await priorContacts(db,owner,lead.id);
  const fallback=fallbackAllowed(config,lead,prior);
  const channel=fallback?'email':preferredContact(lead.detail);if(!channel||!status[channel])continue;
  const recipient=channel==='email'?emailKey(lead.email):phoneKey(lead.phone);if(!recipient)continue;
  if(prior.some(job=>{if(fallback)return !whatsappNotSent(job,lead);if(job.state!=='failed')return true;try{const error=JSON.parse(job.result).error;return !phoneFailures.has(error)&&error!=='请配置已批准的压缩公司介绍PDF';}catch{return true;}}))continue;
  const commandId='first-'+channel+'-'+await digest(owner+':'+lead.id+':'+lead.country+':'+recipient);
  if(await db.prepare('SELECT id FROM crm_workbench_commands WHERE id=?').bind(commandId).first())continue;
  if(await db.prepare("SELECT id FROM crm_workbench_commands WHERE owner_id=? AND desktop_id=? AND kind IN ('send','material') AND state IN ('queued','running','uncertain')").bind(owner,lead.desktop_id).first())continue;
  const option=channel==='whatsapp'?slots.findIndex((n:number)=>n<5):-1;if(channel==='whatsapp'&&option<0)continue;
  const payload={auto_first_contact:true,crm_lead_id:lead.id,assignment_id:lead.assignment_id,assigned_at:lead.assigned_at,name:lead.name,country:lead.country,recipient_key:recipient,channel,option,...(fallback?{fallback_from:'whatsapp'}:{}),text:channel==='whatsapp'?config.options[option]:'自动首次联系邮件：沿用已批准原模板、签名与压缩公司资料',include_materials:false,keep_desktop_draft:false};
  const timestamp=Date.now();
  await db.prepare("INSERT OR IGNORE INTO crm_workbench_commands(id,owner_id,desktop_id,kind,payload,state,created,updated,actor_id) SELECT ?,?,?,'send',?,'queued',?,?,? WHERE EXISTS(SELECT 1 FROM crm_leads WHERE id=? AND owner_id=? AND COALESCE(grade,'') NOT IN ('Yifun Staff','同事') AND status='待首次联系' AND last_contact='' AND COALESCE(json_extract(detail,'$._contact_verified.first_at'),'')='')").bind(commandId,owner,lead.desktop_id,JSON.stringify(payload),timestamp,timestamp,owner,lead.id,owner).run();
  if(option>=0)slots[option]++;queued++;
 }
}
