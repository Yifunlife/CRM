import {tracedRequest,type RequestTrace} from '../../../lib/api/diagnostics';
import { env } from "cloudflare:workers";
import { setAccountPermissions } from '../../../lib/account-edit';
import { AllocationError } from '../../../lib/allocation-server';
import { accountRecords } from '../../../lib/api/accounts';
import { businessModules } from '../../../lib/api/business';
import { customerRecords } from '../../../lib/api/customers';
import { financeRecords } from '../../../lib/api/finance';
import { googleConnection } from '../../../lib/api/google';
import { json,Problem } from '../../../lib/api/http';
import { customerImport } from '../../../lib/api/intake';
import { cloudWebhook } from '../../../lib/cloud-communication';
import { can,ceoRequestAllowed,clean,digest,id,now,passwordHash,verifyPassword } from "../../../lib/crm";
import { customerFiles } from '../../../lib/customer-files';
import { databaseBackup } from '../../../lib/database-backup';
import { finishGoogle } from "../../../lib/google";
import { linkedWorker } from '../../../lib/linked-whatsapp';
import { followupFiles } from '../../../lib/order-followup-files';
import { bridgeDeviceEndpoint } from '../../../lib/workbench-bridge';
import { viewUser } from '../../../lib/workbench-server';
export const dynamic = "force-dynamic";
async function execute(req: Request,trace:RequestTrace) {
 try {
  const db = env.DB; if (!db) throw new Problem("数据库尚未连接，请联系管理员", 503);
  const url = new URL(req.url), path = url.pathname.slice(5), write = req.method !== "GET";
  if(path==="cloud/webhook")return await cloudWebhook(db,env as any,req);
  if (write && path!=="bridge/poll" && path!=="linked/worker" && req.headers.get("origin") !== url.origin) throw new Problem("请求来源无效，请刷新页面重试", 403);
  let body: any = {};
  if (write && !path.startsWith("workbench/files") && !path.startsWith("followup/files")) { const raw = await req.text(); if (raw.length > 5_000_000) throw new Problem("内容过大，请分批导入"); try { body = JSON.parse(raw || "{}"); } catch { throw new Problem("请求格式不正确"); } }
  trace.identify(body);
  if(path==="linked/worker"&&req.method==="POST")return json(await linkedWorker(db,req,body));
  if(path==="bridge/poll"&&req.method==="POST")return json(await bridgeDeviceEndpoint(db,req,body));
  if (path === "google/callback" && !write) {
   let result="connected";
   try { await finishGoogle(req,db,env); } catch { result="error"; }
   return new Response(null,{status:302,headers:{Location:url.origin+"/?google="+result,"Set-Cookie":`crm_google_state=; Path=/api/google; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol==="https:"?"; Secure":""}`,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
  }
  if (path === "login" && req.method === "POST") {
   const username = clean(body.username, 80).toLowerCase(), pw = clean(body.password, 200), key = await digest(username + ":" + (req.headers.get("cf-connecting-ip") || "local"));
   const attempt: any = await db.prepare("SELECT * FROM crm_login_attempts WHERE key=?").bind(key).first();
   if (attempt && attempt.until > Date.now() && attempt.count >= 5) throw new Problem("尝试次数过多，请15分钟后重试", 429);
   const secret = (env as any).INITIAL_ADMIN_PASSWORD;
   if (username === "admin" && secret && pw === secret) {
    const count: any = await db.prepare("SELECT COUNT(*) AS n FROM crm_users").first();
    if (!count.n) await db.prepare("INSERT OR IGNORE INTO crm_users(id,username,name,role,password,active,created) VALUES(?,?,?,?,?,1,?)").bind(id(), "admin", "管理员", "admin", await passwordHash(pw), now()).run();
   }
   const user: any = await db.prepare("SELECT * FROM crm_users WHERE username=? AND active=1").bind(username).first();
   if (!user || !await verifyPassword(pw, user.password)) {
    await db.prepare("INSERT INTO crm_login_attempts(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until<? THEN 1 ELSE count+1 END,until=CASE WHEN until<? THEN excluded.until ELSE until END").bind(key, Date.now()+900000, Date.now(), Date.now()).run();throw new Problem("用户名或密码错误，或账号已停用", 401);
   }
   if(/^yw\d{3}$/.test(username)&&pw===username.toUpperCase())await db.prepare('UPDATE crm_users SET must_change_password=1 WHERE id=?').bind(user.id).run();
   await db.prepare("DELETE FROM crm_login_attempts WHERE key=?").bind(key).run();
   const token = id() + id(); await db.prepare("INSERT INTO crm_sessions(token,user_id,expires) VALUES(?,?,?)").bind(await digest(token), user.id, Date.now()+43200000).run();
   return json({ ok: true }, 200, { "Set-Cookie": `crm_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${url.protocol === "https:" ? "; Secure" : ""}` });
  }
  const token = /(?:^|;\s*)crm_session=([^;]+)/.exec(req.headers.get("cookie") || "")?.[1] || "";
  const actor: any = token ? await db.prepare("SELECT u.id,u.username,u.name,u.role,u.permissions,u.must_change_password FROM crm_sessions s JOIN crm_users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1").bind(await digest(token), Date.now()).first() : null;
  if (!actor) throw new Problem("请先登录", 401);
  trace.actor(actor.id);
  if(actor.must_change_password&&!['me','logout','password'].includes(path))throw new Problem('请先修改初始密码',403);
  const user=await viewUser(db,actor,actor.must_change_password?null:req.headers.get('x-crm-view'));
  if(user.role==='followup'&&!['me','logout','password','followup','workflow/report','workflow/handovers/accept'].includes(path)&&!path.startsWith('followup/')&&!path.startsWith('followup-phase1/')&&!path.startsWith('followup-notifications')&&!(path==='confirmations/releases'&&!write))throw new Problem('跟单员仅可访问本人订单跟单',403);
  const personalCeo=actor.role==='ceo'&&user.personal_business&&user.id===actor.id&&user.role==='sales';
  if((!personalCeo&&!ceoRequestAllowed(actor,path,req.method))||!ceoRequestAllowed(user,path,req.method))throw new Problem('CEO拥有全部查看权限，不能修改业务数据或系统设置',403);
  const permissionDenied=(key:any)=>{if(!can(user,key))throw new Problem('此账号没有此功能的操作权限',403);};
  if(path.startsWith('workbench/')&&write)permissionDenied('customers_edit');
  if(path==='assign'||path==='allocation/distribute')permissionDenied('leads_allocate');
  if(path==='allocation/report')permissionDenied('performance_view');
  if(['import','import-assignments','business-scope','review','grade'].includes(path)||path==='followup'&&write&&typeof body.id==='string'&&!Object.hasOwn(body,'project'))permissionDenied('customers_edit');
  if(path==='advertising'||path.startsWith('operations/'))permissionDenied(write?'advertising_edit':'advertising_view');
  if(path==='users/permissions'&&req.method==='POST')return json(await setAccountPermissions(db,user,body));
  if(path==='admin/backup' &&req.method==='GET'){if(!['admin','ceo'].includes(actor.role)||!['admin','ceo'].includes(user.role))throw new Problem('没有导出备份权限',403);return databaseBackup(db);}
  if(path==='workbench/files'||path.startsWith('workbench/files/'))return await customerFiles(req,db,user,actor);
  if(path==='followup/files'||path.startsWith('followup/files/'))return await followupFiles(req,db,user,actor);
  const businessResult=await businessModules({db,env,req,url,path,write,body,user,actor,token});if(businessResult!==undefined)return businessResult;
  const accountRecordsResult=await accountRecords({db,env,req,url,path,write,body,user,actor,token});if(accountRecordsResult!==undefined)return accountRecordsResult;
  const googleConnectionResult=await googleConnection({db,env,req,url,path,write,body,user,actor,token});if(googleConnectionResult!==undefined)return googleConnectionResult;
  const customerRecordsResult=await customerRecords({db,env,req,url,path,write,body,user,actor,token});if(customerRecordsResult!==undefined)return customerRecordsResult;
  if (user.role === 'sales'&&!can(user,'customers_all')) throw new Problem('此操作需要对应功能权限',403);
  const financeRecordsResult=await financeRecords({db,env,req,url,path,write,body,user,actor,token});if(financeRecordsResult!==undefined)return financeRecordsResult;
  const customerImportResult=await customerImport({db,env,req,url,path,write,body,user,actor,token});if(customerImportResult!==undefined)return customerImportResult;
  throw new Problem("操作不存在",404);
 } catch(e:any) { trace.failure(e); if(e instanceof Problem||e instanceof AllocationError)return json({error:e.message},e.status); const guardMessages=['成交与对应跟单须关联同一项目','接收账号已停用','接收人不再是业务员','接收人已无后勤维护权限','任务或订单已结束','订单已归档','标记已成交前需管理员确认有效成交单','退款金额超过可退金额或收款已撤销','已有退款的收款不能撤销','存在有效收款或跟单，不能直接撤销成交','请先由管理员核实应收并确认发货放行；收款变化后须重新确认'];const guard=guardMessages.find(m=>String(e?.message).includes(m)||String(e?.cause?.message).includes(m));if(guard)return json({error:guard},409);console.error("CRM operation failed",e?.name);return json({error:"保存失败，请刷新后重试；导入中断后重新导入会跳过相同记录"},500); }
}
const handle=(req:Request)=>tracedRequest(req,execute);
export const GET=handle,POST=handle,PATCH=handle,PUT=handle;
