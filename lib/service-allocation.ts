import {customerLeadSQL} from './contact-kind';
import {ALLOCATION_START,allocationPoliciesSQL} from './allocation-priority';
import {AllocationError,allocationWeights} from './allocation-server';
import {id,now} from './crm';
import {monthNow} from './allocation';
import {customerMarket} from './operations-dashboard';
import {automaticAllocationRecipient,DOMESTIC_AUTO_EXCLUDED_USER} from './allocation-intake';
// The approved trial starts on 30 October Sydney time. Historical imports do not enter this queue.
export const TRIAL_START=ALLOCATION_START;
export async function distributeServiceLead(db:D1Database,leadId:string,actor:string,full:boolean){
 const lead=await db.prepare('SELECT market,country,source,business_scope,detail FROM crm_leads WHERE id=?').bind(leadId).first<any>();if(!lead)throw new AllocationError('客资不存在',404);
 const market=customerMarket(lead)==='内贸'?'内贸':'外贸',scope=market==='内贸'?'domestic':'foreign';
 const {people}=await allocationWeights(db);if(!people.some(p=>automaticAllocationRecipient(p,market)))throw new AllocationError('没有对应市场的正常接收人员，客资已保留',409);
 await db.batch([
  db.prepare(`WITH candidates AS (
   SELECT u.id FROM crm_users u JOIN crm_allocation_configs c ON c.scope='all',json_each(c.payload,'$.members') m
   WHERE u.id=json_extract(m.value,'$.user_id') AND json_extract(m.value,'$.state')='参与' AND u.active=1 AND u.role IN ('sales','ceo','management') AND (?<>'domestic' OR u.id<>?) AND EXISTS(SELECT 1 FROM json_each(u.trade_scopes) WHERE value=?)
  ), counts AS (SELECT c.id,
   (SELECT COUNT(DISTINCT a.lead_id) FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE ${customerLeadSQL()} AND a.owner_id=c.id AND a.created>=? AND a.policy IN ${allocationPoliciesSQL}) total,
   (SELECT COUNT(DISTINCT a.lead_id) FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE ${customerLeadSQL()} AND a.owner_id=c.id AND a.created>=? AND a.policy IN ${allocationPoliciesSQL} AND (l.business_scope='meta-full' OR json_extract(l.detail,'$.客服客资类型')='全案')) full_count
   FROM candidates c), pick AS (SELECT id FROM counts ORDER BY CASE WHEN ? THEN full_count ELSE total END,total,id LIMIT 1)
   UPDATE crm_leads SET owner_id=(SELECT id FROM pick) WHERE ${customerLeadSQL('crm_leads')} AND id=? AND source='WhatsApp' AND owner_id IS NULL AND original_owner='' AND review=0 AND EXISTS(SELECT 1 FROM pick)
   AND NOT EXISTS(SELECT 1 FROM crm_assignments WHERE lead_id=crm_leads.id)`)
   .bind(scope,DOMESTIC_AUTO_EXCLUDED_USER,scope,TRIAL_START,TRIAL_START,full?1:0,leadId),
  db.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,business_scope,allocation_month,policy) SELECT ?,id,?,owner_id,?,business_scope,?,'full-first-v1' FROM crm_leads WHERE id=? AND changes()>0 AND owner_id IS NOT NULL")
   .bind(id(),actor,now(),monthNow(),leadId)
 ]);
 return db.prepare('SELECT l.id,l.owner_id,u.name owner_name FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id WHERE l.id=?').bind(leadId).first<any>();
}
