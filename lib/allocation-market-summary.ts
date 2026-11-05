import {customerLeadSQL} from './contact-kind';
import {assignmentFields} from './assignment-reminders';
import {customerMarket} from './operations-dashboard';
import {ALLOCATION_START,allocationPoliciesSQL} from './allocation-priority';
import {sourceRecord} from './customer-origin';
export function allocationLeadKind(lead:any){
 const d=sourceRecord(lead.detail),values=[d['客服客资类型'],d['客资类型'],d['项目类型'],d.form_name,d['来源表单'],d._sheet].filter(v=>typeof v==='string');
 const full=lead.business_scope==='meta-full'||values.some(v=>v==='全案'||v.includes('全案客资'));
 const toy=values.some(v=>v==='玩具'||v.includes('玩具号'));
 return full===toy?'待确认':full?'全案':'玩具';
}
export async function allocationMarketSummary(db:D1Database,today:string){
 const events=(await db.prepare(`SELECT a.owner_id,a.lead_id,${assignmentFields},l.market,l.country,l.source,l.business_scope,l.detail,
 a.created>=? AND a.policy IN ${allocationPoliciesSQL} AS trial
 FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE l.review=0 AND ${customerLeadSQL()}
 AND a.policy NOT IN ('test-simulation','historical-sheet-v1','historical-alignment','historical-sync')`).bind(ALLOCATION_START).all<any>()).results;
 const buckets:Record<string,Map<string,any>>={'内贸':new Map(),'外贸':new Map(),'待确认':new Map()};
 for(const e of events){if(e.legacy_sync)continue;const market=customerMarket(e),at=new Date(e.assigned_at);if(!Number.isFinite(at.getTime()))continue;const date=at.toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});if(date>today)continue;
  const group=buckets[market],key=e.owner_id;let row=group.get(key);if(!row){row={id:key,today:new Set(),month:new Set(),full:new Set(),toy:new Set(),unknown:new Set()};group.set(key,row);}
  if(date===today)row.today.add(e.lead_id);if(date.slice(0,7)===today.slice(0,7))row.month.add(e.lead_id);
  if(e.trial)row[allocationLeadKind(e)==='全案'?'full':allocationLeadKind(e)==='玩具'?'toy':'unknown'].add(e.lead_id);
 }
 return Object.fromEntries(Object.entries(buckets).map(([market,rows])=>[market,[...rows.values()].map(r=>({id:r.id,today:r.today.size,month:r.month.size,full:r.full.size,toy:r.toy.size,unknown:r.unknown.size}))]));
}
