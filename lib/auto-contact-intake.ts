import {sydneyCutoff} from './google-form-sync';
export function intakeDay(at:string){
 const format=new Intl.DateTimeFormat('sv-SE',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const day=format.format(new Date(at)).slice(0,10),wall=Date.parse(day+'T00:00:00Z');let start=wall;
 for(let i=0;i<3;i++)start+=wall-Date.parse(format.format(new Date(start)).replace(' ','T')+'Z');
 return {day,start:new Date(start).toISOString(),cutoff:sydneyCutoff(at)};
}
export async function backfillReady(db:D1Database,owner:string,at:string){
 const day=intakeDay(at);
 if(new Date(day.cutoff).toLocaleDateString('sv-SE',{timeZone:'Australia/Sydney'})!==day.day)return false;
 const batch=await db.prepare("SELECT id FROM crm_batches WHERE source='Meta' AND filename=? AND created>=? LIMIT 1").bind('Google表单｜截止 '+day.cutoff,day.cutoff).first();
 if(!batch||await db.prepare("SELECT id FROM crm_form_import_lock WHERE expires>?").bind(Date.parse(at)).first())return false;
 return !await db.prepare("SELECT c.id FROM crm_workbench_commands c WHERE c.owner_id=? AND c.state IN ('queued','running') AND json_extract(c.payload,'$.auto_first_contact')=1 AND EXISTS(SELECT 1 FROM crm_assignments a WHERE a.lead_id=json_extract(c.payload,'$.crm_lead_id') AND a.owner_id=c.owner_id AND a.created>=?) LIMIT 1").bind(owner,day.start).first();
}
export const todayAssignmentSQL=(start:string)=>`EXISTS(SELECT 1 FROM crm_assignments today WHERE today.lead_id=l.id AND today.owner_id=l.owner_id AND today.created>='${start}')`;
