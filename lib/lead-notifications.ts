import {id,now} from './crm';

// One inbox delivery per enquiry and recipient. The original enquiry remains in customer history.
export function enquiryNotification(db:D1Database,key:string,leadId:string,content:string,at=now()){
 return db.prepare(`INSERT OR IGNORE INTO crm_lead_notifications(id,dedupe_key,lead_id,recipient_id,title,content,created)
 SELECT ?,?,l.id,l.owner_id,'客户再次询问：'||l.name,?,? FROM crm_leads l JOIN crm_users u ON u.id=l.owner_id
 WHERE l.id=? AND u.active=1`).bind(id(),key,content,at,leadId);
}
