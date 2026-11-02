// Cumulative trial receipts continue across days and months; source-sheet ownership is excluded.
export const ALLOCATION_START='2026-10-29T13:00:00.000Z';
export const allocationPoliciesSQL="('equal-v1','equal-global-v1','full-first-v1','manual-v1','followup-handoff-v1')";
export const fullLeadSQL=(alias='l')=>`(${alias}.business_scope='meta-full' OR COALESCE(json_extract(${alias}.detail,'$.客服客资类型'),'')='全案')`;
export async function cumulativeAllocationCounts(db:D1Database){
 return (await db.prepare(`SELECT a.owner_id,COUNT(DISTINCT a.lead_id) total,COUNT(DISTINCT CASE WHEN ${fullLeadSQL()} THEN a.lead_id END) full_count FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE a.created>=? AND a.policy IN ${allocationPoliciesSQL} AND l.review=0 GROUP BY a.owner_id`).bind(ALLOCATION_START).all<{owner_id:string;total:number;full_count:number}>()).results;
}
