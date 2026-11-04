import {GRADES} from './crm';

export const COLLEAGUE_GRADE='Yifun Staff';
export const CONTACT_GRADES=[...GRADES,COLLEAGUE_GRADE];
export const isColleague=(grade:unknown)=>grade===COLLEAGUE_GRADE||grade==='同事';
export const contactGradeLabel=(grade:string)=>isColleague(grade)?'同事':grade;
export const customerLeadSQL=(alias='l')=>`COALESCE(${alias}.grade,'') NOT IN ('Yifun Staff','同事')`;

// Called in the classification transaction. Conversations and completed receipts stay intact.
export function cancelColleagueFirstContacts(db:D1Database,leadId:string,condition='1',args:any[]=[]){
 return db.prepare(`UPDATE crm_workbench_commands SET state='cancelled',result=?,updated=?
  WHERE state='queued' AND json_extract(payload,'$.auto_first_contact')=1
  AND json_extract(payload,'$.crm_lead_id')=?
  AND EXISTS(SELECT 1 FROM crm_leads l WHERE l.id=? AND NOT (${customerLeadSQL()})) AND (${condition})`)
  .bind(JSON.stringify({status:'cancelled',detail:'已标记为同事，不自动首联'}),Date.now(),leadId,leadId,...args);
}
