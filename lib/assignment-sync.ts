import {BUSINESS_SCOPES,monthNow} from './allocation';
import {AllocationError} from './allocation-server';
import {clean,id,now} from './crm';

// Restore assignments already decided in a source file; do not apply new-lead allocation weights.
export async function syncAssignments(db:D1Database,user:any,body:any){
 if(user.role!=='admin')throw new AllocationError('只有管理员可以同步表格中已确定的归属',403);
 const rows=body.rows,filename=clean(body.filename,200),scope=BUSINESS_SCOPES.find(s=>s.id===body.business_scope);
 if(!filename||!scope||!Array.isArray(rows)||!rows.length||rows.length>50)throw new AllocationError('请提供来源文件、业务范围和1至50条已核对记录');
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new AllocationError('同一客资不能重复提交');
 const leads=(await db.prepare('SELECT * FROM crm_leads WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(rows.map(r=>r.id))).all<any>()).results;
 const users=(await db.prepare("SELECT id,name FROM crm_users WHERE active=1 AND role='sales'").all<any>()).results;
 const statements:D1PreparedStatement[]=[],created=now();let unchanged=0;
 for(const row of rows){
  const lead=leads.find(l=>l.id===row.id),owner=users.find(u=>u.id===row.owner_id);
  if(!lead||!owner||!row.fingerprint||lead.fingerprint!==row.fingerprint||lead.source!==scope.source)throw new AllocationError('客资或业务员与核对结果不一致，请重新核对',409);
  if(lead.owner_id===owner.id&&lead.original_owner===owner.name){unchanged++;continue;}
  if(lead.owner_id||lead.original_owner||lead.review||(lead.business_scope&&lead.business_scope!==scope.id))throw new AllocationError('客资已有归属、待核查或业务范围冲突，不可覆盖',409);
  if(!Number.isInteger(row.source_row)||row.source_row<2)throw new AllocationError('请提供原表行号');
  const provenance=JSON.stringify({filename,row:row.source_row});
  statements.push(db.prepare("UPDATE crm_leads SET owner_id=?,original_owner=?,business_scope=?,detail=json_set(detail,'$.分配业务员',?,'$.分配同步来源',json(?)) WHERE id=? AND fingerprint=? AND owner_id IS NULL AND original_owner='' AND review=0 AND (business_scope='' OR business_scope=?)").bind(owner.id,owner.name,scope.id,owner.name,provenance,lead.id,row.fingerprint,scope.id));
  statements.push(db.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,business_scope,allocation_month,policy) SELECT ?,id,?,?,?,business_scope,?,CASE WHEN cohort='historical' THEN 'historical-alignment' ELSE 'historical-sheet-v1' END FROM crm_leads WHERE id=? AND owner_id=? AND original_owner=? AND NOT EXISTS(SELECT 1 FROM crm_assignments WHERE lead_id=?)").bind(id(),user.id,owner.id,created,monthNow(),lead.id,owner.id,owner.name,lead.id));
 }
 const result=statements.length?await db.batch(statements):[];
 const updated=result.filter((_,i)=>i%2===0).reduce((sum,r)=>sum+(r.meta.changes||0),0);
 return {updated,unchanged,conflicts:rows.length-updated-unchanged};
}
