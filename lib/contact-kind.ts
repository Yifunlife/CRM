import {GRADES} from './crm';

export const COLLEAGUE_GRADE='Yifun Staff';
export const CONTACT_GRADES=[...GRADES,COLLEAGUE_GRADE];
export const contactGrades=(market?:string)=>market==='内贸'?['A','B','C','D',COLLEAGUE_GRADE]:CONTACT_GRADES;
export const isColleague=(grade:unknown)=>grade===COLLEAGUE_GRADE||grade==='同事';
export const contactGradeLabel=(grade:string,market?:string)=>isColleague(grade)?'同事':market==='内贸'?({A:'A重点客户',B:'B有意向',C:'C好友不通过/找不到账号',D:'D已流失'} as Record<string,string>)[grade]||grade:market==='全部'&&['C','D'].includes(grade)?grade+'（按市场分类）':({A:'A重点客户',B:'B有意向',C:'C咨询客户',D:'D找不到账号',F:'F已流失'} as Record<string,string>)[grade]||grade;
export function importCustomerGrade(value:unknown,market?:string,legacy=false){const text=String(value||'').trim(),grade=text==='VIP'?'VIP':/^[ABCDF](?:$|[^a-z])/i.test(text)?text[0].toUpperCase():'';if(market!=='内贸')return grade;if(/好友不通过|找不到账号/.test(text))return 'C';if(/已流失/.test(text)||grade==='F')return 'D';if(grade==='C')return legacy||/不回复/.test(text)?'':'C';if(grade==='D')return legacy?'C':'D';return ['A','B'].includes(grade)?grade:'';}
export const customerLeadSQL=(alias='l')=>`COALESCE(${alias}.grade,'') NOT IN ('Yifun Staff','同事')`;

// Called in the classification transaction. Conversations and completed receipts stay intact.
export function cancelColleagueFirstContacts(db:D1Database,leadId:string,condition='1',args:any[]=[]){
 return db.prepare(`UPDATE crm_workbench_commands SET state='cancelled',result=?,updated=?
  WHERE state='queued' AND json_extract(payload,'$.auto_first_contact')=1
  AND json_extract(payload,'$.crm_lead_id')=?
  AND EXISTS(SELECT 1 FROM crm_leads l WHERE l.id=? AND NOT (${customerLeadSQL()})) AND (${condition})`)
  .bind(JSON.stringify({status:'cancelled',detail:'已标记为同事，不自动首联'}),Date.now(),leadId,leadId,...args);
}
