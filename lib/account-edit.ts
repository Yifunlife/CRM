import {passwordHash,PERMISSION_FIELDS} from './crm';
import {AllocationError} from './allocation-server';
export async function editAccount(db:D1Database,actor:any,body:any){
 if(actor.role!=='admin')throw new AllocationError('只有管理员可以编辑账号',403);
 if(Object.keys(body).some(k=>!['id','name','username'].includes(k)))throw new AllocationError('只能修改姓名和用户名');
 const name=typeof body.name==='string'?body.name.trim():'',username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
 if(!name||name.length>80||!/^[a-z0-9._-]{3,80}$/.test(username))throw new AllocationError('姓名为1–80字；用户名为3–80位英文、数字、点、下划线或短横线');
 const existing:any=await db.prepare('SELECT id,role FROM crm_users WHERE id=?').bind(body.id).first();
 if(!existing)throw new AllocationError('账号不存在',404);
 if(await db.prepare('SELECT id FROM crm_users WHERE username=? AND id<>?').bind(username,body.id).first())throw new AllocationError('用户名已存在，请换一个');
 if(existing.role==='sales'&&await db.prepare("SELECT id FROM crm_users WHERE name=? AND role='sales' AND id<>?").bind(name,body.id).first())throw new AllocationError('此业务员姓名已有账号，请使用不同姓名');
 try{await db.prepare('UPDATE crm_users SET name=?,username=? WHERE id=?').bind(name,username,body.id).run();}catch(e:any){if(String(e.message).includes('UNIQUE'))throw new AllocationError('用户名已存在，请换一个');throw e;}
 return {ok:true};
}

export async function resetAccountPassword(db:D1Database,actor:any,body:any){
 if(actor.role!=='admin')throw new AllocationError('只有管理员可以重置密码',403);
 if(Object.keys(body).some(k=>!['id','password'].includes(k)))throw new AllocationError('只能重置账号密码');
 if(typeof body.password!=='string'||body.password!==body.password.trim()||body.password.length<8||body.password.length>200)throw new AllocationError('新密码需为8–200位，首尾不能有空格');
 if(!await db.prepare('SELECT id FROM crm_users WHERE id=?').bind(body.id).first())throw new AllocationError('账号不存在',404);
 await db.batch([db.prepare('UPDATE crm_users SET password=? WHERE id=?').bind(await passwordHash(body.password),body.id),db.prepare('DELETE FROM crm_sessions WHERE user_id=?').bind(body.id)]);
 return {ok:true};
}

export async function setAccountPermissions(db:D1Database,actor:any,body:any){
 if(actor.role!=='admin')throw new AllocationError('只有管理员可以设置账号权限',403);
 if(Object.keys(body).some(k=>!['id','role','permissions'].includes(k))||!['sales','operations','ceo','admin','management'].includes(body.role))throw new AllocationError('请选择有效角色和权限');
 const target:any=await db.prepare('SELECT id,role FROM crm_users WHERE id=?').bind(body.id).first();
 if(!target)throw new AllocationError('账号不存在',404);
 if(target.role==='admin'||body.role==='admin')throw new AllocationError('管理员账号权限固定，不能在此新增或撤销管理员权限');
 const p=body.permissions;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==PERMISSION_FIELDS.length||PERMISSION_FIELDS.some(([k])=>typeof p[k]!=='boolean')||Object.keys(p).some(k=>!PERMISSION_FIELDS.some(([key])=>key===k)))throw new AllocationError('请完整设置所有功能权限');
 if((p.leads_allocate||p.performance_view||p.customers_edit&&body.role!=='sales')&&!p.customers_all||p.followup_edit&&!p.followup_all||p.advertising_edit&&!p.advertising_view)throw new AllocationError('维护或分配功能需要同时开放对应查看权限');
 await db.prepare('UPDATE crm_users SET role=?,permissions=? WHERE id=?').bind(body.role,JSON.stringify(p),target.id).run();
 return {ok:true};
}
