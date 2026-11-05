import {TRADE_SCOPES} from './account-classification';
import {passwordHash,PERMISSION_FIELDS,SALES_PERSONAL_ONLY,permissionDefaults,hasAdminPermissions} from './crm';
import {AllocationError} from './allocation-server';
export async function editAccount(db:D1Database,actor:any,body:any){
 if(!hasAdminPermissions(actor))throw new AllocationError('只有管理员可以编辑账号',403);
 if(Object.keys(body).some(k=>!['id','name','username','trade_scopes','email','whatsapp','wechat'].includes(k)))throw new AllocationError('只能修改姓名、用户名、联系方式和业务范围');
 const name=typeof body.name==='string'?body.name.trim():'',username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
 if(!name||name.length>80||!/^[a-z0-9._-]{3,80}$/.test(username))throw new AllocationError('姓名为1–80字；用户名为3–80位英文、数字、点、下划线或短横线');
 const existing:any=await db.prepare('SELECT id,role FROM crm_users WHERE id=?').bind(body.id).first();
 if(!existing)throw new AllocationError('账号不存在',404);
 if(actor.role==='ceo'&&existing.role==='admin')throw new AllocationError('管理员系统配置账号仅限管理员维护',403);
 const email='email' in body?await accountEmail(db,body.email,existing.id):null;
 const whatsapp='whatsapp' in body?accountContact('whatsapp',body.whatsapp):null,wechat='wechat' in body?accountContact('wechat',body.wechat):null;
 const scopes='trade_scopes' in body?validateTradeScopes(existing.role,body.trade_scopes):null;
 if(await db.prepare('SELECT id FROM crm_users WHERE username=? AND id<>?').bind(username,body.id).first())throw new AllocationError('用户名已存在，请换一个');
 if(existing.role==='sales'&&await db.prepare("SELECT id FROM crm_users WHERE name=? AND role='sales' AND id<>?").bind(name,body.id).first())throw new AllocationError('此业务员姓名已有账号，请使用不同姓名');
 try{await db.prepare('UPDATE crm_users SET name=?,username=?,email=COALESCE(?,email),whatsapp=COALESCE(?,whatsapp),wechat=COALESCE(?,wechat),trade_scopes=COALESCE(?,trade_scopes) WHERE id=?').bind(name,username,email,whatsapp,wechat,scopes===null?null:JSON.stringify(scopes),body.id).run();}catch(e:any){if(String(e.message).includes('crm_users_email_unique'))throw new AllocationError('此邮箱已绑定其他账号，请换一个');if(String(e.message).includes('UNIQUE'))throw new AllocationError('用户名已存在，请换一个');throw e;}
 return {ok:true};
}

export async function resetAccountPassword(db:D1Database,actor:any,body:any){
 if(!hasAdminPermissions(actor))throw new AllocationError('只有管理员可以重置密码',403);
 if(Object.keys(body).some(k=>!['id','password'].includes(k)))throw new AllocationError('只能重置账号密码');
 if(typeof body.password!=='string'||body.password!==body.password.trim()||body.password.length<8||body.password.length>200)throw new AllocationError('新密码需为8–200位，首尾不能有空格');
 const target:any=await db.prepare('SELECT id,role FROM crm_users WHERE id=?').bind(body.id).first();
 if(!target)throw new AllocationError('账号不存在',404);
 if(actor.role==='ceo'&&target.role==='admin')throw new AllocationError('管理员系统配置账号仅限管理员维护',403);
 await db.batch([db.prepare('UPDATE crm_users SET password=?,must_change_password=1 WHERE id=?').bind(await passwordHash(body.password),body.id),db.prepare('DELETE FROM crm_sessions WHERE user_id=?').bind(body.id)]);
 return {ok:true};
}

export async function setAccountPermissions(db:D1Database,actor:any,body:any){
 if(!hasAdminPermissions(actor))throw new AllocationError('只有管理员可以设置账号权限',403);
 if(Object.keys(body).some(k=>!['id','role','permissions'].includes(k))||!['sales','operations','ceo','admin','management','followup'].includes(body.role))throw new AllocationError('请选择有效角色和权限');
 const target:any=await db.prepare('SELECT id,role FROM crm_users WHERE id=?').bind(body.id).first();
 if(!target)throw new AllocationError('账号不存在',404);
 if(target.role==='admin'||body.role==='admin')throw new AllocationError('管理员账号权限固定，不能在此新增或撤销管理员权限');
 const p=body.permissions;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==PERMISSION_FIELDS.length||PERMISSION_FIELDS.some(([k])=>typeof p[k]!=='boolean')||Object.keys(p).some(k=>!PERMISSION_FIELDS.some(([key])=>key===k)))throw new AllocationError('请完整设置所有功能权限');
 if(body.role==='followup'&&PERMISSION_FIELDS.some(([k])=>k!=='followup_edit'&&p[k]))throw new AllocationError('跟单员仅可维护分配给本人的订单，不能开放全公司或业务员权限');
 if(body.role==='sales'&&SALES_PERSONAL_ONLY.some(k=>p[k]))throw new AllocationError('业务员仅使用本人客户功能；全公司管理请使用相应管理角色');
 if((p.leads_allocate||p.performance_view||p.customers_edit&&body.role!=='sales')&&!p.customers_all||p.followup_edit&&body.role!=='followup'&&!p.followup_all||p.advertising_edit&&!p.advertising_view)throw new AllocationError('维护或分配功能需要同时开放对应查看权限');
 if(body.role==='ceo'&&PERMISSION_FIELDS.some(([k])=>p[k]!==permissionDefaults('ceo')[k]))throw new AllocationError('CEO业务权限与管理员一致，系统功能配置仅限管理员');
 await db.prepare("UPDATE crm_users SET role=?,permissions=?,trade_scopes=CASE WHEN ?='followup' THEN '[]' ELSE trade_scopes END WHERE id=?").bind(body.role,JSON.stringify(p),body.role,target.id).run();
 return {ok:true};
}

export function validateTradeScopes(role:string,value:unknown):string[]{
 if(!Array.isArray(value)||value.some(v=>typeof v!=='string'||!Object.hasOwn(TRADE_SCOPES,v))||new Set(value).size!==value.length)throw new AllocationError('业务范围只能选择内贸、外贸，可同时勾选');
 if(!['sales','management','ceo'].includes(role)&&value.length)throw new AllocationError('只有业务员、管理层和CEO可以设置内贸、外贸');
 return Object.keys(TRADE_SCOPES).filter(v=>value.includes(v));
}

export async function accountEmail(db:D1Database,value:unknown,userId=''){
 if(typeof value==='string'&&!value.trim())return '';
 const email=typeof value==='string'?value.trim().toLowerCase():'';
 if(!email||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||email.split('@').length!==2)throw new AllocationError('请填写有效邮箱，保存后可用邮箱或用户名登录');
 if(await db.prepare('SELECT id FROM crm_users WHERE lower(email)=? AND id<>?').bind(email,userId).first())throw new AllocationError('此邮箱已绑定其他账号，请换一个');
 return email;
}
export async function saveAccountProfile(db:D1Database,actor:any,body:any){
 if(Object.keys(body).some(k=>!['email','whatsapp','wechat'].includes(k)))throw new AllocationError('个人资料仅可修改本人邮箱、WhatsApp 和 WeChat');
 const email=await accountEmail(db,body.email,actor.id);
 const whatsapp='whatsapp' in body?accountContact('whatsapp',body.whatsapp):null,wechat='wechat' in body?accountContact('wechat',body.wechat):null;
 try{await db.prepare('UPDATE crm_users SET email=?,whatsapp=COALESCE(?,whatsapp),wechat=COALESCE(?,wechat) WHERE id=?').bind(email,whatsapp,wechat,actor.id).run();}catch(e:any){if(String(e.message).includes('UNIQUE'))throw new AllocationError('此邮箱已绑定其他账号，请换一个');throw e;}
 return {ok:true};
}

export function accountContact(channel:'whatsapp'|'wechat',value:unknown){
 if(typeof value!=='string')throw new AllocationError(channel==='whatsapp'?'请填写有效的 WhatsApp 号码':'请填写有效的 WeChat 微信号');
 const contact=value.trim();
 if(!contact)return '';
 if(channel==='whatsapp'){
  if(contact.length>40||!/^\+[0-9 ().-]+$/.test(contact)||!/^\+[1-9]\d{6,14}$/.test(contact.replace(/[ ().-]/g,'')))throw new AllocationError('WhatsApp 号码需包含 + 和国家区号，共7–15位数字');
  return contact.replace(/[ ().-]/g,'');
 }
 if(contact.length>80||/\s|[\u0000-\u001f\u007f]/.test(contact))throw new AllocationError('WeChat 请填写不含空格的微信号，最多80字');
 return contact;
}
