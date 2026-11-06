// Pending and uncertain sends reserve slots; confirmed failures release them.
export function contactQuota(owner:string,channel:string,at:string,exclude=''){
 const day=new Date(at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 return {sql:`SELECT COUNT(DISTINCT lead_id) FROM (
  SELECT COALESCE(json_extract(c.payload,'$.crm_lead_id'),w.lead_id) lead_id
  FROM crm_workbench_commands c LEFT JOIN crm_workbench_links w ON w.owner_id=c.owner_id AND w.desktop_id=c.desktop_id
  WHERE c.owner_id=? AND c.id<>? AND c.kind IN ('send','material') AND json_extract(c.payload,'$.channel')=?
   AND (c.state IN ('queued','running','uncertain') OR
    (c.state='done' AND json_extract(c.result,'$.status') IN ('sent','confirmed_sent') AND COALESCE(json_extract(c.result,'$.messageId'),'')<>''
     AND date(COALESCE(NULLIF(json_extract(c.result,'$.sentAt'),''),datetime(c.updated/1000,'unixepoch')),'+8 hours')=?))
  UNION SELECT n.lead_id FROM crm_notes n JOIN crm_leads l ON l.id=n.lead_id
  WHERE l.owner_id=? AND n.method=? AND n.id LIKE 'online-%' AND n.content LIKE '线上发送已确认｜%'
   AND (n.content LIKE '%沟通凭据：message:%' OR n.content LIKE '%沟通凭据：receipt:%') AND date(n.created,'+8 hours')=?
  UNION SELECT m.lead_id FROM crm_cloud_messages m WHERE m.owner_id=? AND ?='whatsapp' AND m.direction='out'
   AND m.status IN ('sent','delivered','read') AND COALESCE(m.provider_id,'')<>'' AND date(m.created,'+8 hours')=?
 )`,args:[owner,exclude,channel,day,owner,channel==='email'?'邮件':'WhatsApp',day,owner,channel,day]};
}
export function contactLimit(config:any,channel:string){
 const value=config[channel==='email'?'email_daily_limit':'whatsapp_daily_limit'];
 return Number.isInteger(value)&&value>0?value:channel==='whatsapp'?15:1000000;
}
