import {authorizedLead,clean,id,now,STATUSES} from './crm';
import {canEditCustomerProfile} from './customer-profile';
import {CONTACT_GRADES,cancelColleagueFirstContacts} from './contact-kind';
import {customerChange} from './customer-changes';
import {validateLeadFollowup} from './workflow-server';
import {closingOutcome} from './attribution-server';
import {Problem} from './api/http';

// List maintenance does not create contact receipts, messages or follow-up notes.
export async function updateCustomerList(db:D1Database,user:any,actor:any,body:any){
 const changes=body?.changes;
 if(!Array.isArray(changes)||!changes.length||changes.length>30)throw new Problem('每次请选择1–30位客户');
 if(new Set(changes.map(c=>c.id)).size!==changes.length)throw new Problem('客户选择重复，请重新选择');
 const token=id(),condition='EXISTS(SELECT 1 FROM crm_workflow_audit WHERE id=?)',args=[token];
 const snapshots:any[]=[];
 const statements:D1PreparedStatement[]=[];
 for(const change of changes){
  const lead:any=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(change.id).first();
  if(!lead||!authorizedLead(user,lead))throw new Problem('客户不存在或无权维护',404);
  if(!canEditCustomerProfile(user,lead))throw new Problem('没有客户维护权限',403);
  const patch=change.patch;
  if(!patch||!Object.keys(patch).length||Object.keys(patch).some(k=>!['grade','status','next_date','pause_reason','loss_reason','loss_note'].includes(k)))throw new Problem('请选择状态或客户分类');
  if(!Object.hasOwn(patch,'grade')&&!Object.hasOwn(patch,'status'))throw new Problem('请选择状态或客户分类');
  if(!change.base||['grade','status','next_date','owner_id'].some(k=>change.base[k]!==lead[k]))throw new Problem('客户状态或归属已变化，请刷新后重试',409);
  if(Object.hasOwn(patch,'grade')&&!['',...CONTACT_GRADES].includes(patch.grade))throw new Problem('请选择有效客户分类');
  const dealCount:any=await db.prepare('SELECT COUNT(*) n FROM crm_deals WHERE lead_id=? AND cancelled=0').bind(lead.id).first();
  snapshots.push({id:lead.id,...change.base,deal_count:dealCount.n});
  if(Object.hasOwn(patch,'status')){
   if(!STATUSES.includes(patch.status))throw new Problem('请选择有效客户状态');
   const nextDate=patch.next_date??lead.next_date;
   await validateLeadFollowup(db,lead,{...patch,next_date:nextDate});
   statements.push(...await closingOutcome(db,lead,patch,actor,condition,args));
   statements.push(customerChange(db,actor,lead.id,'status',patch.status,clean(patch.pause_reason||patch.loss_note)||'客户管理总页更新',condition,args));
   statements.push(db.prepare('UPDATE crm_leads SET status=?,next_date=? WHERE id=? AND '+condition).bind(patch.status,nextDate,lead.id,...args));
  }
  if(Object.hasOwn(patch,'grade')){
   statements.push(customerChange(db,actor,lead.id,'grade',patch.grade,'',condition,args));
   statements.push(db.prepare('UPDATE crm_leads SET grade=? WHERE id=? AND '+condition).bind(patch.grade,lead.id,...args),cancelColleagueFirstContacts(db,lead.id,condition,args));
  }
  statements.push(db.prepare('INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) SELECT ?,?,?,?,?,? WHERE '+condition).bind(id(),'客户管理快捷更新',lead.id,JSON.stringify({before:change.base,patch}),now(),actor.id,...args));
 }
 // Admit the whole batch only if every snapshot still matches inside the write transaction.
 const gate=db.prepare(`INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by)
  SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM json_each(?) snapshot JOIN crm_leads l
   ON l.id=json_extract(snapshot.value,'$.id')
   AND l.owner_id IS json_extract(snapshot.value,'$.owner_id')
   AND l.grade IS json_extract(snapshot.value,'$.grade')
   AND l.status IS json_extract(snapshot.value,'$.status')
   AND l.next_date IS json_extract(snapshot.value,'$.next_date')
   AND (SELECT COUNT(*) FROM crm_deals d WHERE d.lead_id=l.id AND d.cancelled=0)=json_extract(snapshot.value,'$.deal_count'))=?`)
  .bind(token,'客户管理批量更新',changes[0].id,JSON.stringify({count:changes.length}),now(),actor.id,JSON.stringify(snapshots),changes.length);
 const result=await db.batch([gate,...statements]);
 if(!result[0].meta.changes)throw new Problem('客户状态或归属已变化，请刷新后重试',409);
 return {ok:true,updated:changes.length};
}
