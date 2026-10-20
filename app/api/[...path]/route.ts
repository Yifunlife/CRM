import {databaseBackup} from '../../../lib/database-backup';
import {customerFiles} from '../../../lib/customer-files';
import {editAccount} from '../../../lib/account-edit';
import {initializeEmployeeLogin} from '../../../lib/employee-login';
import {bridgeDeviceEndpoint} from '../../../lib/workbench-bridge';
import {viewUser,workbenchEndpoint} from '../../../lib/workbench-server';
import {BUSINESS_SCOPES,monthNow} from '../../../lib/allocation';
import {syncAssignments} from '../../../lib/assignment-sync';
import {operationsEndpoint} from '../../../lib/operations-server';
import {advertisingEndpoint} from '../../../lib/advertising-server';
import {allocationEndpoint,AllocationError,allocationWeights,distribute} from '../../../lib/allocation-server';
import {connection,startGoogle,finishGoogle,previewGoogle,seal,GOOGLE_SHEET_ID} from "../../../lib/google";
import { env } from "cloudflare:workers";
import { SOURCES, STATUSES, GRADES, id, now, clean, phoneKey, emailKey, digest, passwordHash, verifyPassword, authorizedLead } from "../../../lib/crm";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
class Problem extends Error { constructor(message: string, public status = 400) { super(message); } }
async function handle(req: Request) {
 try {
  const db = env.DB; if (!db) throw new Problem("数据库尚未连接，请联系管理员", 503);
  const url = new URL(req.url), path = url.pathname.slice(5), write = req.method !== "GET";
  if (write && path!=="bridge/poll" && req.headers.get("origin") !== url.origin) throw new Problem("请求来源无效，请刷新页面重试", 403);
  let body: any = {};
  if (write && !path.startsWith("workbench/files")) { const raw = await req.text(); if (raw.length > 5_000_000) throw new Problem("内容过大，请分批导入"); try { body = JSON.parse(raw || "{}"); } catch { throw new Problem("请求格式不正确"); } }
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
   await db.prepare("DELETE FROM crm_login_attempts WHERE key=?").bind(key).run();
   const token = id() + id(); await db.prepare("INSERT INTO crm_sessions(token,user_id,expires) VALUES(?,?,?)").bind(await digest(token), user.id, Date.now()+43200000).run();
   return json({ ok: true }, 200, { "Set-Cookie": `crm_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${url.protocol === "https:" ? "; Secure" : ""}` });
  }
  const token = /(?:^|;\s*)crm_session=([^;]+)/.exec(req.headers.get("cookie") || "")?.[1] || "";
  const actor: any = token ? await db.prepare("SELECT u.id,u.username,u.name,u.role FROM crm_sessions s JOIN crm_users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1").bind(await digest(token), Date.now()).first() : null;
  if (!actor) throw new Problem("请先登录", 401);
  const user=await viewUser(db,actor,req.headers.get('x-crm-view'));
  if(path==='admin/backup'&&req.method==='GET'){if(actor.role!=='admin'||user.role!=='admin')throw new Problem('只有管理员可以导出备份',403);return databaseBackup(db);}
  if(path==='workbench/files'||path.startsWith('workbench/files/'))return await customerFiles(req,db,user,actor);
  const wb=await workbenchEndpoint(db,user,actor,path,req.method,body);if(wb!==undefined)return json(wb);
  const operationsResult=await operationsEndpoint(db,user,path,req.method,body);
  if(operationsResult!==undefined)return json(operationsResult);
  const advertisingResult=await advertisingEndpoint(db,user,path,req.method,body);
  if(advertisingResult!==undefined)return json(advertisingResult);
  const allocationResult=await allocationEndpoint(db,user,path,req.method,body,url);
  if(allocationResult!==undefined)return json(allocationResult);
  if (path === "logout" && req.method === "POST") { await db.prepare("DELETE FROM crm_sessions WHERE token=?").bind(await digest(token)).run(); return json({ ok: true }, 200, { "Set-Cookie": "crm_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" }); }
  if (path === "me" && !write) return json({...user,can_switch:actor.role==='admin'});
  if (path === "password" && req.method === "POST") {
   if(user.id!==actor.id)throw new Problem("请切回老板视角修改登录账号密码",403);
   const stored: any = await db.prepare("SELECT password FROM crm_users WHERE id=?").bind(user.id).first();
   if (!await verifyPassword(clean(body.current,200), stored.password)) throw new Problem("原密码不正确");
   if (clean(body.password,200).length < 8) throw new Problem("新密码至少8位");
   await db.batch([db.prepare("UPDATE crm_users SET password=? WHERE id=?").bind(await passwordHash(body.password),user.id),db.prepare("DELETE FROM crm_sessions WHERE user_id=? AND token<>?").bind(user.id,await digest(token))]); return json({ok:true});
  }
  if(path==='users/employee-login'&&req.method==='POST')return json(await initializeEmployeeLogin(db,user,body));
  if (path === "users") {
   if (!write) return json(user.role === "sales" ? [] : (await db.prepare("SELECT id,username,name,role,active,created FROM crm_users ORDER BY created").all()).results);
   if (user.role !== "admin") throw new Problem("只有管理员可以管理账号",403);
   if (req.method === "POST") {
    const username = clean(body.username,80).toLowerCase(), name = clean(body.name,80);
    if (!/^[a-z0-9._-]{3,80}$/.test(username) || !name) throw new Problem("请输入姓名及至少3位英文或数字用户名");
    if (!["admin","operations","sales"].includes(body.role) || clean(body.password,200).length < 8) throw new Problem("请选择角色，密码至少8位");
    if (await db.prepare("SELECT id FROM crm_users WHERE username=?").bind(username).first()) throw new Problem("用户名已存在");
    if (body.role === "sales" && await db.prepare("SELECT id FROM crm_users WHERE name=? AND role='sales'").bind(name).first()) throw new Problem("此业务员姓名已有账号，请使用已有账号");
    const userId = id();
    const statements = [db.prepare("INSERT INTO crm_users(id,username,name,role,password,active,created) VALUES(?,?,?,?,?,1,?)").bind(userId,username,name,body.role,await passwordHash(body.password),now())];
    if (body.role === "sales") statements.push(db.prepare("UPDATE crm_leads SET owner_id=? WHERE owner_id IS NULL AND original_owner=?").bind(userId,name));
    await db.batch(statements);return json({ok:true});
   }
   if (req.method === "PATCH") {
    if ('name' in body || 'username' in body) return json(await editAccount(db,user,body));
    if (body.id === user.id) throw new Problem("不能停用当前登录账号");if (![0,1].includes(body.active)) throw new Problem("账号状态无效");
    await db.batch([db.prepare("UPDATE crm_users SET active=? WHERE id=?").bind(body.active,body.id),db.prepare("DELETE FROM crm_sessions WHERE user_id=?").bind(body.id)]);return json({ok:true});
   }
  }
  if (path.startsWith("google/")) {
   if(user.role!=="admin")throw new Problem("只有管理员可以配置Google连接",403);
   const secret=(env as any).GOOGLE_TOKEN_KEY;
   if(path==="google/status"&&!write){const c=await connection(db);return json({configured:!!(c?.client_id&&c.client_secret&&secret),client_id:c?.client_id||"",connected:!!c?.refresh_token,email:c?.email||"",connected_at:c?.connected||"",checked:c?.checked||"",sheet_id:GOOGLE_SHEET_ID,callback_url:url.origin+"/api/google/callback",last_error:c?.last_error||"",protected:!!secret});}
   if(path==="google/config"&&req.method==="POST"){
    if(!secret)throw new Problem("服务器凭证保护尚未配置",503);
    const clientId=clean(body.client_id,300),clientSecret=clean(body.client_secret,2000);
    if(!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId)||!clientSecret)throw new Problem("请填写Google OAuth客户端ID和客户端密钥");
    await db.batch([db.prepare("INSERT INTO crm_google_connection(id,client_id,client_secret) VALUES('main',?,?) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,client_secret=excluded.client_secret,refresh_token='',email='',connected='',checked='',last_error=''").bind(clientId,await seal(clientSecret,secret)),db.prepare("DELETE FROM crm_google_oauth")]);return json({ok:true});
   }
   if(path==="google/start"&&req.method==="POST"){try{const r=await startGoogle(db,env,user.id,url.origin);return json({url:r.url},200,{"Set-Cookie":r.cookie});}catch(e:any){throw new Problem(e.message);}}
   if(path==="google/preview"&&req.method==="POST"){try{return json(await previewGoogle(db,env));}catch(e:any){const message=e.name==='TimeoutError'?'Google连接超时，请稍后重试':e.message;await db.prepare("UPDATE crm_google_connection SET last_error=? WHERE id='main'").bind(clean(message,200)).run();throw new Problem(message);}}
   if(path==="google/disconnect"&&req.method==="POST"){await db.batch([db.prepare("UPDATE crm_google_connection SET refresh_token='',email='',connected='',checked='',last_error='' WHERE id='main'"),db.prepare("DELETE FROM crm_google_oauth")]);return json({ok:true});}
  }
  const scope = user.role === "sales" ? " WHERE l.owner_id=?" : "";
  if (path === "leads" && !write) {
   const result = await db.prepare("SELECT l.*,u.name AS owner_name FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id"+scope+" ORDER BY l.created DESC,l.id LIMIT 10000").bind(...(scope ? [user.id] : [])).all(); return json(result.results.map((r: any) => ({...r,detail:JSON.parse(r.detail)})));
  }
  if (path.startsWith("leads/") && !write) {
   const lead: any = await db.prepare("SELECT l.*,u.name AS owner_name FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id WHERE l.id=?").bind(path.split("/")[1]).first();
   if (!lead || !authorizedLead(user,lead)) throw new Problem("客资不存在或无权查看",404);
   const notes = await db.prepare("SELECT n.*,u.name AS author FROM crm_notes n JOIN crm_users u ON u.id=n.user_id WHERE lead_id=? ORDER BY created DESC").bind(lead.id).all(); const deals=await db.prepare("SELECT d.*,u.name AS owner_name FROM crm_deals d JOIN crm_users u ON u.id=d.owner_id WHERE d.lead_id=? ORDER BY deal_date DESC,created DESC").bind(lead.id).all();return json({...lead,detail:JSON.parse(lead.detail),notes:notes.results,deals:deals.results});
  }
  if (path === "followup" && req.method === "POST") {
   const lead: any = await db.prepare("SELECT * FROM crm_leads WHERE id=?").bind(body.id).first();
   if (!lead || !authorizedLead(user,lead)) throw new Problem("客资不存在或无权操作",404);
   if (!STATUSES.includes(body.status) || !clean(body.content)) throw new Problem("请填写跟进结果并选择状态");
   const date = clean(body.next_date,10); if(date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Problem("跟进日期格式不正确");
   await db.batch([db.prepare("INSERT INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES(?,?,?,?,?,?,?)").bind(id(),lead.id,actor.id,clean(body.content),clean(body.method,40),clean(body.next_step),now()),db.prepare("UPDATE crm_leads SET status=?,next_date=?,last_contact=? WHERE id=?").bind(body.status,date,now(),lead.id)]);return json({ok:true});
  }
  if (path === "grade" && req.method === "POST") {
   const lead: any = await db.prepare("SELECT owner_id FROM crm_leads WHERE id=?").bind(body.id).first();
   if (!lead || !authorizedLead(user,lead)) throw new Problem("客资不存在或无权操作",404);
   if (!["",...GRADES].includes(body.grade)) throw new Problem("请选择VIP、A、B、C或未评级");
   await db.prepare("UPDATE crm_leads SET grade=? WHERE id=?").bind(body.grade,body.id).run();return json({ok:true});
  }
  if (user.role === "sales") throw new Problem("此操作需要运营或管理员权限",403);
  if(path==='import-assignments'&&req.method==='POST')return json(await syncAssignments(db,user,body));
  if(path==='business-scope'&&req.method==='POST'){
   const lead:any=await db.prepare('SELECT id,source FROM crm_leads WHERE id=?').bind(body.id).first(),business=BUSINESS_SCOPES.find(v=>v.id===body.scope);
   if(!lead||!business||business.source!==lead.source)throw new Problem('业务范围必须与客资来源匹配');
   if(await db.prepare('SELECT id FROM crm_deals WHERE lead_id=? LIMIT 1').bind(body.id).first())throw new Problem('已有成交记录的客资不能更改业务范围');
   await db.prepare('UPDATE crm_leads SET business_scope=? WHERE id=?').bind(business.id,lead.id).run();return json({ok:true});
  }
  if(path==='deals'&&req.method==='POST'){
   if(user.role!=='admin')throw new Problem('只有管理员可以确认成交单',403);
   const lead:any=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(body.lead_id).first();
   if(!lead?.owner_id||!BUSINESS_SCOPES.some(v=>v.id===lead.business_scope))throw new Problem('请先设置业务范围与客资负责人');
   const order=clean(body.order_number,100),date=clean(body.deal_date,10),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   if(!order||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>today)throw new Problem('请填写唯一订单编号与有效成交日期，不能选择未来日期');
   if(await db.prepare('SELECT id FROM crm_deals WHERE order_number=?').bind(order).first())throw new Problem('此订单编号已经录入，不可重复计数');
   await db.prepare('INSERT INTO crm_deals(id,order_number,lead_id,owner_id,business_scope,deal_date,created,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id(),order,lead.id,lead.owner_id,lead.business_scope,date,now(),user.id).run();return json({ok:true});
  }
  if(path==='deals'&&req.method==='PATCH'){
   if(user.role!=='admin')throw new Problem('只有管理员可以撤销成交单',403);
   await db.prepare('UPDATE crm_deals SET cancelled=1 WHERE id=?').bind(body.id).run();return json({ok:true});
  }
  if (path === "batches" && !write) return json((await db.prepare("SELECT b.*,u.name AS author,(SELECT COUNT(*) FROM crm_leads l WHERE l.batch_id=b.id) AS inserted FROM crm_batches b JOIN crm_users u ON u.id=b.creator ORDER BY b.created DESC LIMIT 100").all()).results);
  if (path === "assign" && req.method === "POST") {
   const ids = [...new Set(body.ids || [])];if(!ids.length || ids.length>200)throw new Problem("每次选择1至200条客资");
   const owner: any = await db.prepare("SELECT id FROM crm_users WHERE id=? AND active=1 AND role='sales'").bind(body.owner_id).first();if(!owner)throw new Problem("请选择有效的业务员账号");
   const selected = await db.prepare("SELECT id,owner_id,original_owner,review,business_scope FROM crm_leads WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all();
   if(selected.results.length!==ids.length || selected.results.some((r:any)=>r.owner_id || r.original_owner || r.review))throw new Problem("只能分配没有负责人的客资；表格中已分配的客资会保留负责人");
   const rows:any[]=selected.results;
   for(const scope of [...new Set(rows.map(row=>row.business_scope))]){if(!scope)throw new Problem('请先为客资指定业务范围');const {weights}=await allocationWeights(db,scope);if(!weights.some(w=>w.user_id===owner.id))throw new Problem('此业务员未参与所选客资业务范围的分配');}
   await db.batch(ids.flatMap((leadId:any)=>[db.prepare("UPDATE crm_leads SET owner_id=? WHERE id=? AND owner_id IS NULL AND original_owner='' AND review=0 AND business_scope=?").bind(owner.id,leadId,rows.find(row=>row.id===leadId).business_scope),db.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,business_scope,allocation_month) SELECT ?,id,?,?,?,business_scope,? FROM crm_leads WHERE id=? AND owner_id=? AND NOT EXISTS(SELECT 1 FROM crm_assignments WHERE lead_id=?)").bind(id(),user.id,owner.id,now(),monthNow(),leadId,owner.id,leadId)]));return json({ok:true});
  }
  if(path === "review" && req.method === "POST") { await db.prepare("UPDATE crm_leads SET review=0 WHERE id=? AND owner_id IS NULL").bind(body.id).run();return json({ok:true}); }
  if (path === "import" && req.method === "POST") {
   if(!SOURCES.includes(body.source)||!Array.isArray(body.rows)||!body.rows.length||body.rows.length>3000)throw new Problem("请选择来源，每次导入1至3000条");
   const businessScope=clean(body.business_scope,80),business=BUSINESS_SCOPES.find(s=>s.id===businessScope);
   if(businessScope&&(!business||business.source!==body.source))throw new Problem('业务范围与来源渠道不匹配');
   const autoIds:string[]=[];
   const allUsers = (await db.prepare("SELECT id,name FROM crm_users WHERE active=1 AND role='sales'").all()).results;
   const existing: any[] = (await db.prepare("SELECT phone,email,fingerprint FROM crm_leads").all()).results;
   const fingerprints = new Set(existing.map(r=>r.fingerprint)), phones = new Set(existing.map(r=>phoneKey(r.phone)).filter(Boolean)), emails = new Set(existing.map(r=>emailKey(r.email)).filter(Boolean));
   const batchId=id(); let inserted=0,skipped=0,reviewed=0,unmatched=0;
   const statements = [db.prepare("INSERT INTO crm_batches(id,filename,source,created,creator,total) VALUES(?,?,?,?,?,?)").bind(batchId,clean(body.filename,200)||"人工新增",body.source,now(),user.id,body.rows.length)];
   for(const raw of body.rows) {
    const detail: Record<string,string> = {};for(const [k,v] of Object.entries(raw))detail[clean(k,100)]=clean(v);
    const name = clean(detail["客户名称"]||detail["姓名"]||detail["name"],200),phone=clean(detail["联系方式"]||detail["电话"]||detail["phone"],100),email=clean(detail["邮箱"]||detail["email"],200);
    if(!name || (!phone && !email)) { skipped++;continue; }
    const metaId = body.source === "Meta" && detail["form_id"] ? clean(detail["id"],200) : "";
    const fingerprint = await digest(metaId ? "Meta:lead:"+metaId : body.source+JSON.stringify(Object.keys(detail).sort().map(k=>[k,detail[k]])));
    if(fingerprints.has(fingerprint)){skipped++;continue;}fingerprints.add(fingerprint);
    const pk=phoneKey(phone),ek=emailKey(email),review=(pk && phones.has(pk)) || (ek && emails.has(ek)) ? 1:0;
    if(pk)phones.add(pk);if(ek)emails.add(ek);if(review)reviewed++;
    const original=clean(detail["分配业务员"],80),matches=allUsers.filter((u:any)=>u.name===original);
    const owner = original && matches.length===1 ? matches[0].id : null;if(original&&!owner)unmatched++;
    const old=detail["跟进状态"],status=STATUSES.includes(old)?old:old==="已联系"?"已联系待回复":old==="在沟通"?"正在沟通":"待首次联系";
    const leadId=id();if(!original&&!review&&businessScope)autoIds.push(leadId);
    statements.push(db.prepare("INSERT OR IGNORE INTO crm_leads(id,name,phone,email,country,source,channel,entered,owner_id,original_owner,status,detail,fingerprint,review,batch_id,created,business_scope) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(leadId,name,phone,email,clean(detail["所在国家/地区"],100),body.source,clean(detail["来源渠道"],100),clean(detail["录入日期"],100),owner,original,status,JSON.stringify(detail),fingerprint,review,batchId,now(),businessScope));inserted++;
   }
   for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50));let autoAssigned=0,allocationWarning='';if(businessScope&&autoIds.length){const {config,weights}=await allocationWeights(db,businessScope);if(config.rule.automatic&&weights.length){try{for(let i=0;i<autoIds.length;i+=100)autoAssigned+=await distribute(db,autoIds.slice(i,i+100),businessScope,user.id);}catch{allocationWarning='导入已保存，自动分配未完成，请到客资分配页面处理剩余记录';}}else if(config.rule.automatic)allocationWarning='没有可参与的业务员，客资保留待分配';}return json({inserted,skipped,reviewed,unmatched,autoAssigned,allocationWarning});
  }
  throw new Problem("操作不存在",404);
 } catch(e:any) { if(e instanceof Problem||e instanceof AllocationError)return json({error:e.message},e.status); console.error("CRM operation failed",e?.name);return json({error:"保存失败，请刷新后重试；导入中断后重新导入会跳过相同记录"},500); }
}
export const GET=handle,POST=handle,PATCH=handle,PUT=handle;
