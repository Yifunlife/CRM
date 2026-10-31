import {can,authorizedLead,id,now} from './crm';
import {AllocationError} from './allocation-server';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
const text=(value:any,max=2000)=>typeof value==='string'&&value.trim().length<=max?value.trim():fail('填写内容无效或过长');
const date=(value:any)=>typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:fail('日期无效');
const list=async(db:D1Database,sql:string,args:any[]=[]) => (await db.prepare(sql).bind(...args).all<any>()).results;
export const managesSales=(u:any)=>['admin','ceo','management'].includes(u.role)&&can(u,'customers_all');
async function lead(db:D1Database,u:any,key:string){const row:any=await db.prepare('SELECT id,owner_id FROM crm_leads WHERE id=?').bind(key).first();if(!row||!authorizedLead(u,row))fail('客户不存在或无权查看',404);return row;}
async function entity(db:D1Database,u:any,key:string){
 if(!/^(sales|order):[^:]+$/.test(key)||key.length>150)fail('项目编号无效');
 const [type,keyId]=key.split(':');let row:any;
 if(type==='sales')row=await db.prepare('SELECT project_id,lead_id FROM crm_sales_projects WHERE project_id=?').bind(keyId).first();
 else if(type==='order')row=await db.prepare('SELECT id,lead_id,commercial_id FROM crm_followup_orders WHERE id=?').bind(keyId).first();
 if(!row||type==='order'&&u.role==='sales'&&row.commercial_id!==u.id)fail('项目不存在或无权查看',404);await lead(db,u,row.lead_id);return row;
}
async function append(db:D1Database,actor:any,kind:string,payload:any,leadId:string|null=null,projectId:string|null=null){const key=id(),at=now();await db.prepare('INSERT INTO crm_sales_events(id,kind,payload,lead_id,project_id,occurred_at,created,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(key,kind,JSON.stringify(payload),leadId,projectId,at,at,actor.id).run();return {ok:true,id:key};}
export async function salesWorkflowEndpoint(db:D1Database,u:any,actor:any,path:string,method:string,body:any,url:URL){
 if(!['sales-management/customers','sales-management/meeting','sales-management/plan'].includes(path))return undefined;
 if(method!=='GET'&&(!body||typeof body!=='object'||Array.isArray(body)))fail('请求格式无效');
 if(!can(u,'customers_all')&&u.role!=='sales')fail('没有销售管理访问权限',403);
 const editing=can(u,'customers_edit')&&u.role!=='ceo';
 if(path==='sales-management/customers'&&method==='GET'){
  const all=can(u,'customers_all'),where=all?'1=1':'l.owner_id=?',args=all?[]:[u.id],q=url.searchParams.get('q')||'',page=Math.max(1,Number(url.searchParams.get('page')||1));if(!Number.isSafeInteger(page))fail('页码无效');
  const search=q?' AND (l.name LIKE ? OR l.country LIKE ?)':'',queryArgs=[...args,...(q?['%'+q+'%','%'+q+'%']:[])];
  const [counts,rows,total,meetings]=await Promise.all([
   list(db,`SELECT l.status,COUNT(*) AS count FROM crm_leads l WHERE ${where} GROUP BY l.status`,args),
   list(db,`SELECT l.id,l.name,l.country,l.status,l.last_contact,l.next_date,l.owner_id,u.name AS owner_name,(SELECT MIN(n.created) FROM crm_notes n WHERE n.lead_id=l.id AND n.method<>'表单咨询') AS first_contact,(SELECT n.content FROM crm_notes n WHERE n.lead_id=l.id ORDER BY n.created DESC,n.rowid DESC LIMIT 1) AS last_note,(SELECT n.next_step FROM crm_notes n WHERE n.lead_id=l.id ORDER BY n.created DESC,n.rowid DESC LIMIT 1) AS next_step FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id WHERE ${where}${search} ORDER BY l.next_date,l.id LIMIT 30 OFFSET ?`,[...queryArgs,(page-1)*30]),
   db.prepare(`SELECT COUNT(*) AS count FROM crm_leads l WHERE ${where}${search}`).bind(...queryArgs).first<any>(),
   list(db,`SELECT e.id,e.lead_id,e.payload,e.created,l.name AS customer_name FROM crm_sales_events e JOIN crm_leads l ON l.id=e.lead_id WHERE e.kind='客户会议与到访' AND ${where} ORDER BY e.rowid DESC LIMIT 100`,args)
  ]);return {counts,rows,total:total?.count||0,page,meetings:meetings.map(e=>({...e,...JSON.parse(e.payload)}))};
 }
 if(path==='sales-management/meeting'&&method==='POST'){
  if(!editing)fail('没有客户维护权限',403);const leadId=text(body.lead_id,100);await lead(db,u,leadId);
  if(!['线上会议','到访公司','拜访客户'].includes(body.type))fail('会议类型无效');
  const payload={type:body.type,date:date(body.date),participants:text(body.participants,500),result:text(body.result),next_action:text(body.next_action)};if(!payload.participants||!payload.result||!payload.next_action)fail('请补齐参与人、结论与下一步');return append(db,actor,'客户会议与到访',payload,leadId);
 }
 if(path==='sales-management/plan'){
  const key=method==='GET'?url.searchParams.get('entity')||'':text(body.entity,150),p=await entity(db,u,key);
  const current:any=await db.prepare("SELECT id,payload FROM crm_sales_events WHERE kind='项目计划更新' AND json_extract(payload,'$.entity')=? ORDER BY rowid DESC LIMIT 1").bind(key).first();
  if(method==='GET')return {revision:current?.id||'',rows:current?JSON.parse(current.payload).rows:[],can_edit:editing||managesSales(u)&&u.role!=='ceo'};
  if(method!=='POST')fail('请求方式无效',405);if(!editing&&!(managesSales(u)&&u.role!=='ceo'))fail('没有项目维护权限',403);
  if(!Array.isArray(body.rows)||body.rows.length>50)fail('项目计划最多50个节点');
  const rows=body.rows.map((r:any)=>{if(!r||typeof r!=='object'||Array.isArray(r))fail('计划节点格式无效');const row={stage:text(r.stage,100),node:text(r.node,200),owner:text(r.owner,200),start:r.start?date(r.start):'',due:r.due?date(r.due):'',actual:r.actual?date(r.actual):'',progress:text(r.progress),files:text(r.files,1000),status:text(r.status,30),commercial:text(r.commercial,1000)};if(!row.node||!['未开始','进行中','待确认','已完成','异常'].includes(row.status)||row.start&&row.due&&row.start>row.due)fail('请核对节点名称、状态及起止日期');return row;});
  const eventId=id(),at=now();const result=await db.prepare("INSERT INTO crm_sales_events(id,kind,payload,lead_id,project_id,occurred_at,created,created_by) SELECT ?,'项目计划更新',?,?,?,?,?,? WHERE COALESCE((SELECT id FROM crm_sales_events WHERE kind='项目计划更新' AND json_extract(payload,'$.entity')=? ORDER BY rowid DESC LIMIT 1),'')=?").bind(eventId,JSON.stringify({entity:key,rows}),p.lead_id,p.project_id||null,at,at,actor.id,key,text(body.revision||'',100)).run();
  if(!result.meta.changes)fail('项目计划已变化，请刷新后重试',409);return {ok:true};
 }
 fail('页面接口不存在',404);
}
