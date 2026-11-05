import {contactMethodAliases,contactMethodSQL} from './customer-contact-method';

// Only actual contact records qualify; drafts, failed sends and system notes do not.
export const customerContactCTE=`contact_events AS (
 SELECT n.lead_id,${contactMethodSQL('n.method')} AS method,julianday(n.created) AS contacted_at,'note:'||n.id AS event_id
 FROM crm_notes n WHERE trim(n.content)<>'' AND lower(trim(n.method)) IN (${contactMethodAliases.map(alias=>`'${alias}'`).join(',')}) AND julianday(n.created)<=julianday('now')
 UNION ALL
 SELECT m.lead_id,'WhatsApp',julianday(m.created),'cloud:'||m.id FROM crm_cloud_messages m JOIN crm_leads l ON l.id=m.lead_id AND l.owner_id=m.owner_id
 WHERE m.direction='out' AND m.status IN ('sent','delivered','read') AND julianday(m.created)<=julianday('now')
 UNION ALL
 SELECT w.lead_id,CASE WHEN h.channel='email' THEN '邮件' ELSE 'WhatsApp' END,h.sort_time/86400000.0+2440587.5,'history:'||h.message_key
 FROM crm_workbench_history h JOIN crm_workbench_links w ON w.owner_id=h.owner_id AND w.desktop_id=h.desktop_id JOIN crm_leads l ON l.id=w.lead_id AND l.owner_id=w.owner_id
 WHERE h.channel IN ('whatsapp','email') AND json_extract(h.payload,'$.outgoing')=1 AND h.sort_time>0 AND h.sort_time/86400000.0+2440587.5<=julianday('now')
), ranked_contacts AS (SELECT *,ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY contacted_at DESC,event_id DESC) AS rank FROM contact_events)`;
