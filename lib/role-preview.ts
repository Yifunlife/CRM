import {digest,id,now} from './crm';
import {Problem,json} from './api/http';
import {workflowAudit} from './workflow-server';

const COOKIE='crm_role_preview',LIFETIME=30*60*1000;
const START='角色验收开始',END='角色验收结束';
export const canRolePreview=(actor:any)=>['admin','ceo'].includes(actor?.role)&&actor.active!==0&&!actor.must_change_password;
export const rolePreviewToken=(req:Request)=>/(?:^|;\s*)crm_role_preview=([^;]+)/.exec(req.headers.get('cookie')||'')?.[1]||'';
export const rolePreviewCookie=(req:Request,value='')=>`${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value?86400:0}${new URL(req.url).protocol==='https:'?'; Secure':''}`;
const fields='id,username,name,email,role,permissions,trade_scopes,active,must_change_password';
const permittedTarget=(actor:any,target:any)=>!!target?.active&&(actor.role==='admin'||target.role!=='admin');
export type RolePreview={context_id:string;target:any;actor:any;expires_at:number;status:string;reason:string};
export function rolePreviewInfo(preview:RolePreview){return {context_id:preview.context_id,target:{id:preview.target.id,name:preview.target.name,role:preview.target.role},actor:{id:preview.actor.id,name:preview.actor.name,role:preview.actor.role},expires_at:preview.expires_at,status:preview.status,reason:preview.reason,read_only:true};}
async function record(db:D1Database,actor:any,session:string,token:string){
 if(!/^[a-f0-9-]{72}$/.test(token))return null;
 const key=await digest(token),row:any=await db.prepare('SELECT a.id,a.entity_id,a.payload FROM crm_workflow_audit a LEFT JOIN crm_workflow_audit e ON e.id=? WHERE a.id=? AND a.kind=? AND a.created_by=? AND e.id IS NULL').bind('preview-end:'+key,key,START,actor.id).first();
 if(!row)return null;
 const payload=JSON.parse(row.payload);
 return payload.session_hash===await digest(session)?{...row,payload}:null;
}
function endRecord(db:D1Database,actor:any,row:any,reason:string){return db.prepare('INSERT OR IGNORE INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) VALUES(?,?,?,?,?,?)').bind('preview-end:'+row.id,END,row.entity_id,JSON.stringify({context_id:row.id,target_name:row.payload.target_name,reason}),now(),actor.id);}
export async function rolePreviewEndpoint(db:D1Database,actor:any,session:string,req:Request,path:string,body:any){
 if(path!=='role-preview'&&path!=='role-preview/end')return undefined;
 const token=rolePreviewToken(req);
 if(path==='role-preview/end'&&req.method==='POST'){
  const previous=await record(db,actor,session,token);if(previous)await endRecord(db,actor,previous,'退出验收').run();
  return json({ok:true},200,{'Set-Cookie':rolePreviewCookie(req)});
 }
 if(!canRolePreview(actor))throw new Problem('只有管理员和CEO可以进行全角色验收',403);
 if(path==='role-preview'&&req.method==='GET'){
  const people=(await db.prepare(`SELECT ${fields} FROM crm_users WHERE active=1${actor.role==='admin'?'':" AND role<>'admin'"} ORDER BY role,name,id`).all<any>()).results;
  const rows=(await db.prepare("SELECT a.created,a.payload,EXISTS(SELECT 1 FROM crm_workflow_audit e WHERE e.id='preview-end:'||a.id) AS closed FROM crm_workflow_audit a WHERE a.kind=? AND a.created_by=? ORDER BY a.created DESC,a.id DESC LIMIT 10").bind(START,actor.id).all<any>()).results;
  return json({people,history:rows.map(r=>{const p=JSON.parse(r.payload);return {created:r.created,target_name:p.target_name,target_role:p.target_role,expires_at:p.expires_at,closed:!!r.closed};})});
 }
 if(path!=='role-preview'||req.method!=='POST')throw new Problem('不支持此验收操作',405);
 const target:any=await db.prepare(`SELECT ${fields} FROM crm_users WHERE id=?`).bind(typeof body.target_id==='string'?body.target_id:'').first();
 if(!permittedTarget(actor,target))throw new Problem('所选人员不存在、已停用或不在可验收范围内',403);
 if(target.id===actor.id)throw new Problem('查看本人请退出验收，回到自己的工作区');
 const value=id()+id(),key=await digest(value),expires=Date.now()+LIFETIME,previous=await record(db,actor,session,token);
 const payload={session_hash:await digest(session),expires_at:expires,target_name:target.name,target_role:target.role,actor_role:actor.role,purpose:'全角色页面与权限验收'};
 await db.batch([...(previous?[endRecord(db,actor,previous,'切换人员')]:[]),db.prepare('INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) VALUES(?,?,?,?,?,?)').bind(key,START,target.id,JSON.stringify(payload),now(),actor.id)]);
 return json({ok:true},200,{'Set-Cookie':rolePreviewCookie(req,value)});
}
export async function resolveRolePreview(db:D1Database,actor:any,session:string,req:Request):Promise<RolePreview|null>{
 const token=rolePreviewToken(req),expected=req.headers.get('x-crm-preview');
 if(!token){if(expected)throw new Problem('验收视角已变化，请刷新页面',409);return null;}
 const row=await record(db,actor,session,token);
 if(expected&&expected!==row?.id)throw new Problem('验收视角已变化，请刷新页面',409);
 const target=row?await db.prepare(`SELECT ${fields} FROM crm_users WHERE id=?`).bind(row.entity_id).first<any>():null;
 let reason='';
 if(!row)reason='验收已结束或登录身份已变化，请退出验收后重新选择。';
 else if(!canRolePreview(actor))reason='当前账号已不具备验收权限，请退出验收。';
 else if(!permittedTarget(actor,target))reason='所选人员已停用、删除或权限范围已变化，请重新选择。';
 else if(row.payload.expires_at<=Date.now())reason='本次验收已超过30分钟，请重新选择人员或退出验收。';
 else if(target.must_change_password)reason='所选人员尚未完成初始密码设置，真实账号目前不能进入业务页面。';
 return {context_id:row?.id||'',target:target||{id:row?.entity_id||'',name:row?.payload.target_name||'原验收人员',role:row?.payload.target_role||''},actor,expires_at:row?.payload.expires_at||0,status:reason?'blocked':'active',reason};
}
export async function guardRolePreview(db:D1Database,preview:RolePreview,req:Request,path:string){
 if(preview.status!=='active')throw new Problem(preview.reason,409);
 if(req.method==='GET'&&path!=='admin/backup'&&!['cloud/webhook','google/callback','linked/worker'].includes(path)&&!path.startsWith('bridge/'))return;
 await workflowAudit(db,preview.actor,'角色验收拒绝操作',preview.target.id,{context_id:preview.context_id,method:req.method,entry:path.split('/')[0]}).run();
 throw new Problem('当前为只读验收，不能保存、发送、授权或审批；请先退出验收',403);
}
// GET handlers receive a second guard so a read cannot accidentally persist business changes.
export function previewDatabase(db:D1Database):D1Database{
 const denied=()=>{throw new Problem('只读验收不能写入业务数据',403);};
 const statement=(value:D1PreparedStatement):D1PreparedStatement=>new Proxy(value,{get(target,key){if(key==='run')return denied;if(key==='bind')return (...args:any[])=>statement(target.bind(...args));const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
 return new Proxy(db,{get(target,key){
  if(key==='prepare')return (sql:string)=>{const tokens=sql.replace(/'(?:''|[^'])*'/g,"''").replace(/"(?:""|[^"])*"/g,'""');if(!/^\s*(SELECT|WITH)\b/i.test(tokens)||/\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|ATTACH|DETACH|VACUUM|REINDEX)\b/i.test(tokens))denied();return statement(target.prepare(sql));};
  if(['batch','exec','withSession','dump'].includes(String(key)))return denied;
  const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;
 }});
}
export async function previewResponse(req:Request,response:Response){
 if(!rolePreviewToken(req))return response;
 const path=new URL(req.url).pathname.slice(5),headers=new Headers(response.headers);headers.set('X-CRM-Preview-Read-Only','1');
 if(response.ok&&req.method==='GET'&&['linked/status','communication/connection','cloud/settings'].includes(path)){
  const data:any=await response.json(),linked=path==='communication/connection'?data.whatsapp:data;
  if(linked){if('qr' in linked)linked.qr=[];if('qr_expires' in linked)linked.qr_expires=0;}if('verifyToken' in data)data.verifyToken='';
  headers.delete('content-length');return new Response(JSON.stringify(data),{status:response.status,headers});
 }
 return new Response(response.body,{status:response.status,headers});
}
