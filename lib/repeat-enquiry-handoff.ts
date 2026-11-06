import {allocationMarketSQL,validAssignmentSQL} from './allocation-events';
import {domesticProjectBudget} from './domestic-budget';
import {ALLOCATION_START,allocationPoliciesSQL,fullLeadSQL} from './allocation-priority';
import {AllocationError,allocationWeights} from './allocation-server';
import {monthNow} from './allocation';
import {now} from './crm';
import {automaticAllocationRecipient,DOMESTIC_AUTO_EXCLUDED_USER} from './allocation-intake';

// A new repeat submission permits this specific handoff; historical ownership is never swept.
export async function handoffFollowupEnquiry(db:D1Database,submissionId:string,actor:string,at=now()){
 const lead=await db.prepare(`SELECT l.*,${allocationMarketSQL()} allocation_market,u.name previous_owner,${fullLeadSQL()} is_full FROM crm_form_submissions s JOIN crm_leads l ON l.id=s.lead_id JOIN crm_users u ON u.id=l.owner_id WHERE s.id=? AND s.kind='repeat' AND u.role='followup' AND u.active=1 AND l.review=0`).bind(submissionId).first<any>();
 if(!lead)return 0;
 const market=lead.allocation_market,scope=market==='内贸'?'domestic':'foreign';if(market==='待确认')throw new AllocationError('再次咨询待转交：请先补充客资市场',409);
 const budget=market==='内贸'?domesticProjectBudget(lead):null,priority=!!budget?.qualifies;const {config,people}=await allocationWeights(db);if(!config.rule.automatic||!people.some(p=>automaticAllocationRecipient(p,market,lead)&&(!priority||p.id===DOMESTIC_AUTO_EXCLUDED_USER)))throw new AllocationError('再次咨询待转交：自动分配未开启或没有对应市场的接收业务员',409);
 const key='handoff:form:'+submissionId;
 const message=`此前由跟单 ${lead.previous_owner} 对接过。\n转交原因：客户再次咨询，原负责人为跟单，现按全案优先、累计均衡转交业务员。\n原跟单：${lead.previous_owner}\n`;
 const result=await db.batch([
  db.prepare(`WITH candidates AS (SELECT u.id FROM crm_users u JOIN crm_allocation_configs c ON c.scope='all',json_each(c.payload,'$.members') m WHERE u.id=json_extract(m.value,'$.user_id') AND json_extract(c.payload,'$.rule.automatic')=1 AND json_extract(m.value,'$.state')='参与' AND u.active=1 AND u.role IN ('sales','ceo','management') AND (?<>'domestic' OR u.id<>? OR ?>=2000000) AND (?=0 OR u.id=?) AND EXISTS(SELECT 1 FROM json_each(u.trade_scopes) WHERE value=?)),
   counts AS (SELECT c.id,(SELECT COUNT(DISTINCT a.lead_id) FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE a.owner_id=c.id AND a.created>=? AND a.policy IN ${allocationPoliciesSQL} AND ${validAssignmentSQL()} AND (${allocationMarketSQL()})=? AND l.review=0) total,(SELECT COUNT(DISTINCT a.lead_id) FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE a.owner_id=c.id AND a.created>=? AND a.policy IN ${allocationPoliciesSQL} AND ${validAssignmentSQL()} AND (${allocationMarketSQL()})=? AND l.review=0 AND ${fullLeadSQL()}) full_count FROM candidates c),
   pick AS (SELECT id FROM counts ORDER BY CASE WHEN ? THEN full_count ELSE total END,total,id LIMIT 1)
   UPDATE crm_leads SET owner_id=(SELECT id FROM pick) WHERE id=? AND owner_id=? AND review=0 AND EXISTS(SELECT 1 FROM pick) AND EXISTS(SELECT 1 FROM crm_users WHERE id=crm_leads.owner_id AND role='followup' AND active=1) AND NOT EXISTS(SELECT 1 FROM crm_assignments WHERE id=?) AND (?<>'内贸' OR detail=?)`)
   .bind(scope,DOMESTIC_AUTO_EXCLUDED_USER,budget?.qualifies?budget.minimum:0,priority?1:0,DOMESTIC_AUTO_EXCLUDED_USER,scope,ALLOCATION_START,market,ALLOCATION_START,market,lead.is_full,lead.id,lead.owner_id,key,market,lead.detail),
  db.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,business_scope,allocation_month,policy) SELECT ?,id,?,owner_id,?,business_scope,?,'followup-handoff-v1' FROM crm_leads WHERE id=? AND changes()>0")
   .bind(key,actor,at,monthNow(new Date(at)),lead.id),
  db.prepare("INSERT OR IGNORE INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) SELECT ?,'跟单客资转交',a.lead_id,json_object('submission_id',?,'from_owner_id',?,'from_owner_name',?,'from_original_owner',?,'to_owner_id',a.owner_id,'to_owner_name',u.name,'reason','客户再次咨询，原负责人为跟单','policy',a.policy),a.created,? FROM crm_assignments a JOIN crm_users u ON u.id=a.owner_id WHERE a.id=?")
   .bind(key,submissionId,lead.owner_id,lead.previous_owner,lead.original_owner,actor,key),
  db.prepare("INSERT OR IGNORE INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) SELECT ?,a.lead_id,?,?||'新业务员：'||u.name||char(10)||'转交时间（悉尼）：'||?,'客资转交','请先查看原跟单对接记录，再接续本次咨询',a.created FROM crm_assignments a JOIN crm_users u ON u.id=a.owner_id WHERE a.id=?")
   .bind(key,actor,message,new Intl.DateTimeFormat('zh-CN',{timeZone:'Australia/Sydney',dateStyle:'short',timeStyle:'short',hour12:false}).format(new Date(at)),key),
  db.prepare("INSERT OR IGNORE INTO crm_lead_notifications(id,dedupe_key,lead_id,recipient_id,title,content,created) SELECT ?,?,a.lead_id,a.owner_id,'重要分配变更：'||l.name,?||'新业务员：'||u.name||char(10)||'转交时间（悉尼）：'||?,a.created FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id JOIN crm_users u ON u.id=a.owner_id WHERE a.id=? AND l.owner_id=a.owner_id")
   .bind(key,key,message,new Intl.DateTimeFormat('zh-CN',{timeZone:'Australia/Sydney',dateStyle:'short',timeStyle:'short',hour12:false}).format(new Date(at)),key)
 ]);
 return result[0].meta.changes||0;
}
