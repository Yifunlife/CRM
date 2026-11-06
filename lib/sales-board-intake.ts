import {allocationMarketSQL,validAssignmentSQL} from './allocation-events';
import {assignmentFields} from './assignment-reminders';
import {customerLeadSQL} from './contact-kind';
import {reportAcquiredDay} from './report-acquired-day';
import {inReportPeriod,reportPeriod} from './report-period';

export async function salesBoardIntake(db:D1Database,month:string,today:string){
 const period=reportPeriod(new URLSearchParams({month}),today.slice(0,7));
 const [leads,assignments,links]=await Promise.all([
  db.prepare(`SELECT l.id,l.entered,l.created,l.review,l.fingerprint,
   json_extract(l.detail,'$._workbench.owner_id') workbench_owner,${allocationMarketSQL()} market
   FROM crm_leads l WHERE ${customerLeadSQL()}`).all<any>(),
  db.prepare(`SELECT a.owner_id,a.lead_id,${assignmentFields} FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id
   WHERE l.review=0 AND ${customerLeadSQL()} AND ${validAssignmentSQL()}
   AND a.policy NOT IN ('test-simulation','historical-sheet-v1','historical-alignment','historical-sync')`).all<any>(),
  db.prepare('SELECT lead_id,subject_id FROM crm_customer_subject_links').all<any>()
 ]);
 const subjects=new Map(links.results.map(l=>[l.lead_id,l.subject_id]));
 const key=(id:string)=>subjects.has(id)?'subject:'+subjects.get(id):'lead:'+id;
 const byId=new Map(leads.results.map(l=>[l.id,l])),dates=new Map<string,string>();
 for(const l of leads.results){const date=reportAcquiredDay(l.entered)||reportAcquiredDay(l.created),k=key(l.id);if(date&&(!dates.has(k)||date<dates.get(k)!))dates.set(k,date);}
 const allocated=new Set<string>(),counts=new Map<string,{id:string;currency:string;system:Set<string>;other:Set<string>}>();
 function bucket(owner:string,market:string){
  if(!owner||!['内贸','外贸'].includes(market))return;
  const currency=market==='内贸'?'CNY':'USD',k=owner+':'+currency;
  if(!counts.has(k))counts.set(k,{id:owner,currency,system:new Set(),other:new Set()});
  return counts.get(k)!;
 }
 for(const a of assignments.results){
  const date=reportAcquiredDay(a.assigned_at);if(a.legacy_sync||!date||date>today)continue;
  const k=key(a.lead_id);allocated.add(k);
  if(inReportPeriod(date,period))bucket(a.owner_id,byId.get(a.lead_id)?.market)?.system.add(k);
 }
 for(const l of leads.results){
  const k=key(l.id),date=dates.get(k);
  // A CRM customer linked to the workbench is not a new workbench acquisition.
  if(l.review||!l.fingerprint.startsWith('workbench:')||!l.workbench_owner||allocated.has(k)||!date||date>today||!inReportPeriod(date,period))continue;
  bucket(l.workbench_owner,l.market)?.other.add(k);
 }
 return [...counts.values()].map(r=>({id:r.id,currency:r.currency,system_customers:r.system.size,other_customers:r.other.size}));
}
