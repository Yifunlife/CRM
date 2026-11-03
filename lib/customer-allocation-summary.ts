import {customerLeadSQL} from './contact-kind';
import {can} from './crm';
import {assignmentFields} from './assignment-reminders';
import {suiteDay} from './sales-suite';

export async function customerAllocationSummary(db:D1Database,user:any,today=suiteDay()){
 const all=can(user,'customers_all');
 const rows=(await db.prepare(`WITH events AS (
  SELECT a.owner_id,a.lead_id,${assignmentFields}
  FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id
  WHERE l.review=0 AND ${customerLeadSQL()} AND a.policy<>'test-simulation' ${all?'':'AND a.owner_id=?'}
 ), counted AS (
  SELECT owner_id,
   COUNT(DISTINCT CASE WHEN date(assigned_at,'+8 hours')=? THEN lead_id END) AS today,
   COUNT(DISTINCT CASE WHEN strftime('%Y-%m',assigned_at,'+8 hours')=? THEN lead_id END) AS month,
   COUNT(DISTINCT lead_id) AS cumulative
  FROM events WHERE assignment_policy NOT IN ('historical-sheet-v1','historical-alignment','historical-sync')
   AND legacy_sync=0 AND date(assigned_at,'+8 hours')<=?
  GROUP BY owner_id
 ) SELECT u.id,u.name,u.active,COALESCE(c.today,0) AS today,COALESCE(c.month,0) AS month,COALESCE(c.cumulative,0) AS cumulative
 FROM crm_users u LEFT JOIN counted c ON c.owner_id=u.id
 WHERE (u.role IN ('sales','ceo','management') OR c.owner_id IS NOT NULL)
  AND (u.active=1 OR c.owner_id IS NOT NULL) ${all?'':'AND u.id=?'}
 ORDER BY u.active DESC,cumulative DESC,u.name,u.id`).bind(...(all?[]:[user.id]),today,today.slice(0,7),today,...(all?[]:[user.id])).all<{id:string;name:string;active:number;today:number;month:number;cumulative:number}>()).results;
 return {date:today,timezone:'Asia/Shanghai',rows,today:rows.reduce((n,r)=>n+r.today,0),month:rows.reduce((n,r)=>n+r.month,0),cumulative:rows.reduce((n,r)=>n+r.cumulative,0)};
}
