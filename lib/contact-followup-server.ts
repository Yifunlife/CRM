import {contactFollowup} from './contact-followup';
import {customerLeadSQL,isColleague} from './contact-kind';

export async function dormantContactIds(db:D1Database,leads:any[],at:string){
 const eligible=leads.filter(l=>l.owner_id&&l.customer_type!=='existing'&&!isColleague(l.grade));
 const owners=[...new Set<string>(eligible.map(l=>l.owner_id))];
 const rows=(await Promise.all(owners.map(owner=>contactFollowups(db,owner,eligible.filter(l=>l.owner_id===owner),at)))).flat();
 return new Set(rows.filter(r=>r.kind==='dormant').map(r=>r.id));
}

export async function contactFollowups(db:D1Database,owner:string,leads:any[],at:string){
 const sentNote="(n.content LIKE '线上发送已确认｜%' OR n.content LIKE '发送已确认｜%' OR n.method IN ('首次WhatsApp','二次WhatsApp','首次邮件','二次邮件') OR (e.id IS NOT NULL AND json_extract(e.payload,'$.result') NOT IN ('未接通 / 未联系上','其他') AND json_extract(e.payload,'$.type')<>'客户实际回复'))";
 const [notes,issues,cloud,archive]=await Promise.all([
  db.prepare(`SELECT n.lead_id,
   MIN(CASE WHEN n.method IN ('WhatsApp','首次WhatsApp','二次WhatsApp') AND ${sentNote} THEN n.created END) whatsapp,
   MIN(CASE WHEN n.method IN ('邮件','首次邮件','二次邮件') AND ${sentNote} THEN n.created END) email,
   MAX(CASE WHEN n.method IN ('WhatsApp','邮件','首次WhatsApp','二次WhatsApp','首次邮件','二次邮件') AND ${sentNote} THEN n.created END) last_sent,
   MAX(CASE WHEN n.method IN ('系统收信','客户回复') OR n.content LIKE '客户线上回复｜%' OR n.content LIKE '客户回复｜%' THEN n.created END) reply_at
   FROM crm_notes n JOIN crm_leads l ON l.id=n.lead_id LEFT JOIN crm_sales_events e ON e.id=n.id AND e.kind='业务员跟进记录' WHERE l.owner_id=? AND ${customerLeadSQL()} AND julianday(n.created)<=julianday(?) GROUP BY n.lead_id`).bind(owner,at).all<any>(),
  db.prepare(`SELECT COALESCE(json_extract(c.payload,'$.crm_lead_id'),w.lead_id) lead_id,c.state,c.updated FROM crm_workbench_commands c LEFT JOIN crm_workbench_links w ON w.owner_id=c.owner_id AND w.desktop_id=c.desktop_id JOIN crm_leads l ON l.id=COALESCE(json_extract(c.payload,'$.crm_lead_id'),w.lead_id) AND l.owner_id=c.owner_id WHERE c.owner_id=? AND c.kind IN ('send','material') AND c.state IN ('queued','running','uncertain','failed') AND ${customerLeadSQL()} ORDER BY c.updated DESC`).bind(owner).all<any>(),
  db.prepare(`SELECT m.lead_id,MIN(CASE WHEN m.direction='out' AND m.status IN ('sent','delivered','read') THEN m.created END) whatsapp,MAX(CASE WHEN m.direction='out' AND m.status IN ('sent','delivered','read') THEN m.created END) last_sent,MAX(CASE WHEN m.direction='in' AND m.status IN ('received','history') THEN m.created END) reply_at FROM crm_cloud_messages m JOIN crm_leads l ON l.id=m.lead_id AND l.owner_id=m.owner_id WHERE m.owner_id=? AND ${customerLeadSQL()} AND julianday(m.created)<=julianday(?) GROUP BY m.lead_id`).bind(owner,at).all<any>(),
  db.prepare(`SELECT w.lead_id,MIN(CASE WHEN json_extract(h.payload,'$.outgoing')=1 AND h.channel='whatsapp' THEN h.sort_time END) whatsapp,MIN(CASE WHEN json_extract(h.payload,'$.outgoing')=1 AND h.channel='email' THEN h.sort_time END) email,MAX(CASE WHEN json_extract(h.payload,'$.outgoing')=1 THEN h.sort_time END) last_sent,MAX(CASE WHEN json_extract(h.payload,'$.outgoing')=0 THEN h.sort_time END) reply_at,SUM(CASE WHEN json_type(h.payload,'$.outgoing') IS NULL OR h.sort_time<=0 THEN 1 ELSE 0 END) unknown_history FROM crm_workbench_history h JOIN crm_workbench_links w ON w.desktop_id=h.desktop_id AND w.owner_id=h.owner_id JOIN crm_leads l ON l.id=w.lead_id AND l.owner_id=w.owner_id WHERE h.owner_id=? AND ${customerLeadSQL()} AND h.sort_time<=? GROUP BY w.lead_id`).bind(owner,Date.parse(at)).all<any>()
 ]);
 const evidence=new Map<string,any>();
 for(const n of notes.results)evidence.set(n.lead_id,n);
 for(const m of cloud.results){const n=evidence.get(m.lead_id)||{},earliest=[n.whatsapp,m.whatsapp].filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b))[0],latest=(key:string)=>[n[key],m[key]].filter(Boolean).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];evidence.set(m.lead_id,{...n,whatsapp:earliest,last_sent:latest('last_sent'),reply_at:latest('reply_at')});}
 for(const a of archive.results){const n=evidence.get(a.lead_id)||{},value={...n,unknown_history:a.unknown_history};for(const key of ['whatsapp','email','last_sent','reply_at']){const dates=[n[key],a[key]>0?new Date(a[key]).toISOString():''].filter(Boolean).sort((x,y)=>Date.parse(x)-Date.parse(y));value[key]=['whatsapp','email'].includes(key)?dates[0]:dates.at(-1);}evidence.set(a.lead_id,value);}
 const seen=new Set<string>();for(const issue of issues.results){if(seen.has(issue.lead_id))continue;seen.add(issue.lead_id);evidence.set(issue.lead_id,{...evidence.get(issue.lead_id),issue_at:new Date(issue.updated).toISOString(),issue_state:issue.state});}
 return leads.map(lead=>contactFollowup(lead,evidence.get(lead.id)||{},at)).filter((row):row is NonNullable<typeof row>=>!!row).sort((a,b)=>a.rank-b.rank||(a.due_at||'9999').localeCompare(b.due_at||'9999')||a.id.localeCompare(b.id));
}
