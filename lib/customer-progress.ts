import {can} from './crm';

export async function customerProgress(db:D1Database,user:any){
 const all=can(user,'customers_all'),manage=all&&can(user,'leads_allocate');
 const pending=`SELECT p.id,p.lead_id,p.target_lead_id,p.state FROM crm_customer_pool p LEFT JOIN crm_leads l ON l.id=COALESCE(p.lead_id,p.target_lead_id) WHERE p.state<>'已入CRM'${manage?'':user.role==='sales'?' AND (l.owner_id=? OR (p.created_by=? AND l.owner_id IS NULL))':' AND (p.created_by=? OR l.owner_id=?)'}`;
 const stages=(await db.prepare(`WITH pending AS (${pending}), records AS (
  SELECT CASE WHEN state='待确认' THEN '待核查' ELSE '待分配' END AS stage FROM pending
  UNION ALL
  SELECT CASE WHEN l.cohort='historical' AND l.owner_id IS NULL THEN '待归属对齐' WHEN l.cohort='unknown' THEN '日期待确认' WHEN l.review THEN '待核查' WHEN l.owner_id IS NOT NULL OR l.original_owner<>'' THEN '已分配' ELSE '待分配' END AS stage FROM crm_leads l
  WHERE ${all?'1=1':'l.owner_id=?'} AND NOT EXISTS(SELECT 1 FROM pending p WHERE p.target_lead_id IS NULL AND COALESCE(p.lead_id,p.id)=l.id)
 ) SELECT stage,COUNT(*) AS count FROM records GROUP BY stage`).bind(...(manage?[]:[user.id,user.id]),...(all?[]:[user.id])).all<{stage:string;count:number}>()).results;
 const stageCounts:Record<string,number>={'全部':0,'待核查':0,'待分配':0,'已分配':0};
 for(const row of stages){stageCounts[row.stage]=row.count;stageCounts['全部']+=row.count;}
 const staff=(await db.prepare(`SELECT u.id AS owner_id,u.name AS owner_name,u.active,COUNT(l.id) AS assigned,
  COALESCE(SUM(CASE WHEN (l.last_contact<>'' OR l.cohort='historical') THEN 1 ELSE 0 END),0) AS followed,
  COALESCE(SUM(CASE WHEN l.id IS NOT NULL AND l.cohort='new' AND l.last_contact='' AND l.status='待首次联系' THEN 1 ELSE 0 END),0) AS uncontacted,
  COALESCE(SUM(CASE WHEN l.id IS NOT NULL AND l.cohort<>'historical' AND l.last_contact='' AND (l.status<>'待首次联系' OR l.cohort='unknown') THEN 1 ELSE 0 END),0) AS unverified,
  COALESCE(SUM(CASE WHEN l.status IN ('已成交','已结束') THEN 1 ELSE 0 END),0) AS closed
  FROM crm_users u LEFT JOIN crm_leads l ON l.owner_id=u.id
  WHERE ${all?"(u.role='sales' OR EXISTS(SELECT 1 FROM crm_leads owned WHERE owned.owner_id=u.id))":'u.id=?'}
  GROUP BY u.id,u.name,u.active ORDER BY assigned DESC,u.name,u.id`).bind(...(all?[]:[user.id])).all()).results;
 const legacy=await db.prepare(`SELECT COUNT(*) AS count FROM crm_leads l WHERE l.owner_id IS NULL AND l.cohort='historical'${all?'':' AND l.owner_id=?'}`).bind(...(all?[]:[user.id])).first<{count:number}>();
 const cohorts=(await db.prepare(`SELECT cohort,COUNT(*) AS count FROM crm_leads WHERE ${all?'1=1':'owner_id=?'} GROUP BY cohort`).bind(...(all?[]:[user.id])).all()).results;
 return {cohorts,stageCounts,staff,unlinkedOwnerCount:legacy?.count||0};
}
