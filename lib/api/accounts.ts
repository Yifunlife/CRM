import { editAccount,resetAccountPassword } from '../account-edit';
import { can,clean,digest,id,now,passwordHash,verifyPassword } from '../crm';
import { initializeEmployeeLogin } from '../employee-login';
import { followupManager } from '../order-followup-server';
import { workflowAudit } from '../workflow-server';
import type { ApiContext } from './context';
import { json,Problem } from './http';
export async function accountRecords({db,req,path,write,body,user,actor,token}:ApiContext):Promise<Response|undefined>{
  if (path === "logout" && req.method === "POST") { await db.prepare("DELETE FROM crm_sessions WHERE token=?").bind(await digest(token)).run(); return json({ ok: true }, 200, { "Set-Cookie": "crm_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" }); }
  if (path === "me" && !write) return json({...user,must_change_password:!!actor.must_change_password,can_switch:actor.role==='admin',can_followup:['sales','followup'].includes(user.role)||can(user,'followup_all')||await followupManager(db,user),capabilities:Object.fromEntries(['customers_all','customers_edit','leads_allocate','performance_view','followup_all','followup_edit','advertising_view','advertising_edit'].map(k=>[k,can(user,k as any)]))});
  if (path === "password" && req.method === "POST") {
   if(user.id!==actor.id)throw new Problem("请切回老板视角修改登录账号密码",403);
   const stored: any = await db.prepare("SELECT password FROM crm_users WHERE id=?").bind(user.id).first();
   if (!await verifyPassword(clean(body.current,200), stored.password)) throw new Problem("原密码不正确");
   if(typeof body.password!=='string'||body.password!==body.password.trim()||body.password.length<8||body.password.length>200)throw new Problem('新密码需为8–200位，首尾不能有空格');
   if(await verifyPassword(body.password,stored.password))throw new Problem('新密码不能与原密码相同');
   await db.batch([db.prepare("UPDATE crm_users SET password=?,must_change_password=0 WHERE id=?").bind(await passwordHash(body.password),user.id),db.prepare("DELETE FROM crm_sessions WHERE user_id=? AND token<>?").bind(user.id,await digest(token))]); return json({ok:true});
  }
  if(path==='users/employee-login'&&req.method==='POST')return json(await initializeEmployeeLogin(db,user,body));
  if(path==='users/reset-password'&&req.method==='POST')return json(await resetAccountPassword(db,user,body));
  if (path === "users") {
   if (!write) return json(!can(user,'customers_all') ? [] : (await db.prepare("SELECT id,username,name,role,permissions,active,created,EXISTS(SELECT 1 FROM crm_followup_staff s WHERE s.user_id=crm_users.id) AS followup_staff FROM crm_users ORDER BY created").all()).results);
   if (user.role !== "admin") throw new Problem("只有管理员可以管理账号",403);
   if (req.method === "POST") {
    const username = clean(body.username,80).toLowerCase(), name = clean(body.name,80);
    if (!/^[a-z0-9._-]{3,80}$/.test(username) || !name) throw new Problem("请输入姓名及至少3位英文或数字用户名");
    if (!["admin","operations","sales","ceo","management","followup"].includes(body.role) || clean(body.password,200).length < 8) throw new Problem("请选择角色，密码至少8位");
    if (await db.prepare("SELECT id FROM crm_users WHERE username=?").bind(username).first()) throw new Problem("用户名已存在");
    if (body.role === "sales" && await db.prepare("SELECT id FROM crm_users WHERE name=? AND role='sales'").bind(name).first()) throw new Problem("此业务员姓名已有账号，请使用已有账号");
    const userId = id();
    const statements = [db.prepare("INSERT INTO crm_users(id,username,name,role,password,active,created,must_change_password) VALUES(?,?,?,?,?,1,?,1)").bind(userId,username,name,body.role,await passwordHash(body.password),now())];
    if (body.role === "sales") statements.push(db.prepare("UPDATE crm_leads SET owner_id=? WHERE owner_id IS NULL AND original_owner=?").bind(userId,name));
    if(body.role==='followup')statements.push(db.prepare("UPDATE crm_users SET permissions=? WHERE id=?").bind(JSON.stringify({followup_edit:true}),userId));
    await db.batch(statements);return json({ok:true});
   }
   if (req.method === "PATCH") {
    if ('name' in body || 'username' in body) return json(await editAccount(db,user,body));
    if (body.id === user.id) throw new Problem("不能停用当前登录账号");if (![0,1].includes(body.active)) throw new Problem("账号状态无效");
    await db.batch([db.prepare("UPDATE crm_users SET active=? WHERE id=?").bind(body.active,body.id),db.prepare("DELETE FROM crm_sessions WHERE user_id=?").bind(body.id),workflowAudit(db,actor,body.active?'启用账号':'停用账号待交接',body.id,{active:body.active})]);return json({ok:true});
   }
  }
}
