import {AllocationError} from './allocation-server';
import {clean,phoneKey,emailKey,id,now} from './crm';
export async function historicalAlignment(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 if(!path.startsWith('historical-alignment'))return undefined;
 if(user.id!==actor.id||user.role!=='admin')throw new AllocationError('请管理员使用本人账号对齐历史归属',403);
 if(method!=='POST'||!['historical-alignment/preview','historical-alignment/apply'].includes(path))throw new AllocationError('操作不存在',404);
 if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>500||!clean(body.filename,200))throw new AllocationError('请选择有来源文件名的1至500条历史归属');
 const leads=(await db.prepare('SELECT id,name,phone,email,fingerprint,owner_id,original_owner,review,cohort FROM crm_leads').all<any>()).results;
 const users=(await db.prepare("SELECT id,name FROM crm_users WHERE active=1 AND role IN ('sales','ceo','management')").all<any>()).results;
 const seen=new Set<string>();
 const rows=body.rows.map((r:any,index:number)=>{
  const candidates=leads.filter(l=>r.id?l.id===r.id:(phoneKey(r.phone)&&phoneKey(r.phone)===phoneKey(l.phone))||(emailKey(r.email)&&emailKey(r.email)===emailKey(l.email)));
  const people=users.filter(u=>r.owner_id?u.id===r.owner_id:u.name===clean(r.owner));
  const l=candidates[0],u=people[0];let conflict='';
  if(candidates.length!==1)conflict=candidates.length?'联系方式对应多条客资，需人工确认客资编号':'未找到客户';
  else if(l.cohort!=='historical')conflict='不属于历史客资，请核对原始日期';
  else if(people.length!==1)conflict='负责人不存在、重名或已停用';
  else if(l.owner_id&&l.owner_id!==u.id||l.original_owner&&l.original_owner!==u.name)conflict='现有归属与原表不同，需人工核正';
  else if(l.review)conflict='此客资存在待处理冲突';
  else if(seen.has(l.id))conflict='文件内重复客资';
  if(l)seen.add(l.id);
  const snapshot=l?JSON.stringify([l.fingerprint,l.owner_id,l.original_owner,l.review]):'';
  if(path.endsWith('/apply')&&!conflict&&r.snapshot!==snapshot)conflict='预览后资料已改变，请重新预览';
  return {...r,row:r.row||index+2,id:l?.id||'',name:l?.name||'',owner_id:u?.id||'',owner:u?.name||r.owner||'',snapshot,conflict,unchanged:!!l&&!!u&&l.owner_id===u.id&&l.original_owner===u.name};
 });
 if(path.endsWith('/preview'))return {rows};
 const statements:D1PreparedStatement[]=[];
 for(const r of rows.filter((r:any)=>!r.conflict&&!r.unchanged)){
  const [fingerprint,owner,original,review]=JSON.parse(r.snapshot),at=now();
  statements.push(db.prepare("UPDATE crm_leads SET owner_id=?,original_owner=?,detail=json_set(detail,'$.归属对齐来源',json(?)) WHERE id=? AND cohort='historical' AND fingerprint=? AND owner_id IS ? AND original_owner=? AND review=?").bind(r.owner_id,r.owner,JSON.stringify({filename:clean(body.filename,200),row:r.row,at,actor:actor.id}),r.id,fingerprint,owner,original,review));
  statements.push(db.prepare("INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) SELECT ?,'历史归属对齐',?,?,?,? WHERE changes()>0").bind(id(),r.id,JSON.stringify({before:{owner_id:owner,original_owner:original},after:{owner_id:r.owner_id,original_owner:r.owner},filename:clean(body.filename,200),row:r.row}),at,actor.id));
 }
 const result=statements.length?await db.batch(statements):[];
 return {rows,updated:result.filter((_,i)=>i%2===0).reduce((n,r)=>n+(r.meta.changes||0),0),unchanged:rows.filter((r:any)=>r.unchanged&&!r.conflict).length,conflicts:rows.filter((r:any)=>r.conflict)};
}
