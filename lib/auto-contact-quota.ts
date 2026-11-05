// Pending sends reserve a customer slot so concurrent polls cannot overfill a day.
export function contactQuota(owner:string,channel:string,at:string,exclude=''){
 const day=new Date(at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 return {sql:`SELECT COUNT(DISTINCT lead_id) FROM (
  SELECT COALESCE(json_extract(c.payload,'$.crm_lead_id'),w.lead_id) lead_id
  FROM crm_workbench_commands c LEFT JOIN crm_workbench_links w ON w.owner_id=c.owner_id AND w.desktop_id=c.desktop_id
  WHERE c.owner_id=? AND c.id<>? AND c.kind IN ('send','material') AND json_extract(c.payload,'$.channel')=?
   AND (c.state IN ('queued','running','uncertain') OR date(c.created/1000,'unixepoch','+8 hours')=? OR date(c.updated/1000,'unixepoch','+8 hours')=?)
  UNION SELECT n.lead_id FROM crm_notes n JOIN crm_leads l ON l.id=n.lead_id
  WHERE l.owner_id=? AND n.method IN (${channel==='email'?"'邮件','首次邮件','二次邮件'":"'WhatsApp','首次WhatsApp','二次WhatsApp'"})
   AND date(n.created,'+8 hours')=? AND (n.content LIKE '线上发送已确认｜%' OR n.content LIKE '发送已确认｜%' OR n.method LIKE '首次%' OR n.method LIKE '二次%')
 )`,args:[owner,exclude,channel,day,day,owner,day]};
}
export function contactLimit(config:any,channel:string){
 const value=config[channel==='email'?'email_daily_limit':'whatsapp_daily_limit'];
 return Number.isInteger(value)&&value>0?value:channel==='whatsapp'?15:1000000;
}
