import {id,now} from './crm';
// Read the old value inside the same database batch as the update, so concurrent
// writers cannot produce a change log with a stale before-value.
export function customerChange(db:D1Database,actor:any,leadId:string,field:'grade'|'status',after:string,reason=''){
 return db.prepare(`INSERT INTO crm_attribution_events(id,kind,entity_id,payload,created,created_by)
 SELECT ?,?,?,json_object('field',?,'before',${field},'after',?,'reason',?),?,? FROM crm_leads WHERE id=? AND ${field}<>?`).bind(id(),field==='grade'?'客户分类变化':'跟进状态变化',leadId,field,after,reason,now(),actor.id,leadId,after);
}
export async function customerChanges(db:D1Database,user:any,all:boolean,leadId=''){
 const conditions=["(e.kind IN ('客户分类变化','跟进状态变化','核查咨询有效性') OR (e.kind='确认归因' AND json_extract(e.payload,'$.kind')='lead'))"],args:string[]=[];
 if(!all){conditions.push('l.owner_id=?');args.push(user.id);}if(leadId){conditions.push('l.id=?');args.push(leadId);}
 const rows=(await db.prepare(`SELECT e.*,l.name AS customer_name,u.name AS actor_name,bc.name AS before_campaign_name,ac.name AS after_campaign_name FROM crm_attribution_events e JOIN crm_leads l ON l.id=e.entity_id JOIN crm_users u ON u.id=e.created_by LEFT JOIN crm_attribution_campaigns bc ON bc.id=json_extract(e.payload,'$.before.campaign_id') LEFT JOIN crm_attribution_campaigns ac ON ac.id=json_extract(e.payload,'$.after.campaign_id') WHERE ${conditions.join(' AND ')} ORDER BY e.created DESC,e.rowid DESC LIMIT 200`).bind(...args).all<any>()).results;
 return rows.map(e=>({...e,payload:JSON.parse(e.payload)}));
}
