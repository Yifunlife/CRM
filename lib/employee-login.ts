import {AllocationError} from './allocation-server';
import {passwordHash} from './crm';

export async function initializeEmployeeLogin(db:D1Database,actor:any,body:any){
 if(actor.role!=='admin')throw new AllocationError('只有管理员可以设置工号登录',403);
 if(!Array.isArray(body.accounts)||!body.accounts.length||body.accounts.length>100)throw new AllocationError('请选择1–100个账号');
 const ids=new Set(),codes=new Set(),statements=[];
 for(const item of body.accounts){
  if(typeof item.employee_number!=='string'||!/^YW\d{3}$/.test(item.employee_number)||ids.has(item.id)||codes.has(item.employee_number))throw new AllocationError('工号格式错误或重复');
  ids.add(item.id);codes.add(item.employee_number);
  const user:any=await db.prepare('SELECT id,name,username FROM crm_users WHERE id=?').bind(item.id).first();
  if(!user||user.name!==item.name||user.username!==item.previous_username)throw new AllocationError('账号已变化，请重新核对');
  const username=item.employee_number.toLowerCase();
  if(user.username===username)throw new AllocationError('此账号已使用该工号，不重复重置密码');
  if(await db.prepare('SELECT id FROM crm_users WHERE username=? AND id<>?').bind(username,item.id).first())throw new AllocationError('工号已被其他账号使用');
  statements.push(db.prepare('UPDATE crm_users SET username=?,password=?,must_change_password=1 WHERE id=?').bind(username,await passwordHash(item.employee_number),item.id));
  statements.push(db.prepare('DELETE FROM crm_sessions WHERE user_id=?').bind(item.id));
 }
 await db.batch(statements);
 return {ok:true,updated:ids.size};
}
