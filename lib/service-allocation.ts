import {AllocationError,allocationWeights} from './allocation-server';
import {id,now} from './crm';
import {monthNow} from './allocation';
// The approved trial starts on 30 October Sydney time. Historical imports do not enter this queue.
export const TRIAL_START='2026-10-29T13:00:00.000Z';
export async function distributeServiceLead(db:D1Database,leadId:string,actor:string,full:boolean){
 const {weights}=await allocationWeights(db);if(!weights.length)throw new AllocationError('没有正常参与的业务员，客资已保留，恢复参与人员后重试',409);
 await db.batch([
  db.prepare(`WITH candidates AS (
   SELECT u.id FROM crm_users u JOIN crm_allocation_configs c ON c.scope='all',json_each(c.payload,'$.members') m
   WHERE u.id=json_extract(m.value,'$.user_id') AND json_extract(m.value,'$.state')='参与' AND u.active=1 AND u.role IN ('sales','ceo','management')
  ), counts AS (SELECT c.id,
   (SELECT COUNT(*) FROM crm_assignments a WHERE a.owner_id=c.id AND a.created>=? AND a.policy IN ('equal-v1','equal-global-v1','full-first-v1')) total,
   (SELECT COUNT(*) FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE a.owner_id=c.id AND a.created>=? AND a.policy IN ('equal-v1','equal-global-v1','full-first-v1') AND (l.business_scope='meta-full' OR json_extract(l.detail,'$.客服客资类型')='全案')) full_count
   FROM candidates c), pick AS (SELECT id FROM counts ORDER BY CASE WHEN ? THEN full_count ELSE total END,total,id LIMIT 1)
   UPDATE crm_leads SET owner_id=(SELECT id FROM pick) WHERE id=? AND source='WhatsApp' AND owner_id IS NULL AND original_owner='' AND review=0 AND EXISTS(SELECT 1 FROM pick)
   AND NOT EXISTS(SELECT 1 FROM crm_assignments WHERE lead_id=crm_leads.id)`)
   .bind(TRIAL_START,TRIAL_START,full?1:0,leadId),
  db.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,business_scope,allocation_month,policy) SELECT ?,id,?,owner_id,?,business_scope,?,'full-first-v1' FROM crm_leads WHERE id=? AND changes()>0 AND owner_id IS NOT NULL")
   .bind(id(),actor,now(),monthNow(),leadId)
 ]);
 return db.prepare('SELECT l.id,l.owner_id,u.name owner_name FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id WHERE l.id=?').bind(leadId).first<any>();
}
