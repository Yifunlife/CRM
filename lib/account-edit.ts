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
