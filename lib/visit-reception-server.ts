import {authorizedLead,can,id,now} from './crm';
import {AllocationError} from './allocation-server';
import {customerLeadSQL} from './contact-kind';
import {validDate} from './personal-work';
import {VISIT_TIMES,VISIT_LOCATIONS,VISIT_PURPOSES,EXPENSE_CATEGORIES,visitCents,expenseSummary,type VisitReception} from './visit-reception';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
const text=(v:any,max=2000)=>typeof v==='string'&&v.trim().length<=max?v.trim():fail('填写内容无效或过长');
const list=async(db:D1Database,q:string,args:any[]=[]) => (await db.prepare(q).bind(...args).all<any>()).results;
const access=(u:any,row:any)=>authorizedLead(u,row)||row.receptionist_id===u.id;
const salesRole=(role:string)=>['sales','management','ceo','admin'].includes(role);
async function roster(db:D1Database){return list(db,'SELECT id,name,role FROM crm_users WHERE active=1 ORDER BY name');}
function validate(body:any,people:any[]):VisitReception{
 if(!body||typeof body!=='object'||Array.isArray(body))fail('请求格式无效');
 const v:any={};for(const key of ['id','revision','lead_id','receptionist_id'])v[key]=text(body[key],100);
 if(!v.id||!v.lead_id||!v.receptionist_id)fail('请选择客户和接待业务员');
 v.date=text(body.date,10);if(!validDate(v.date))fail('请选择有效的到访日期');
 v.arrival=text(body.arrival,5);if(v.arrival&&!VISIT_TIMES.includes(v.arrival))fail('到达时间请选择整点或半点');
 v.purpose=text(body.purpose,30);if(!VISIT_PURPOSES.includes(v.purpose))fail('请选择来访目的');
 for(const key of ['welcome','pickup','requirements','expense_note','result','next_action'])v[key]=text(body[key]);
 v.visitor_count=text(body.visitor_count,3);if(v.visitor_count&&!/^[1-9]\d{0,2}$/.test(v.visitor_count))fail('来访人数需为1至999');
 for(const key of ['photography','management','gift','completed']){if(typeof body[key]!=='boolean')fail('接待选项无效');v[key]=body[key];}
 if(!Array.isArray(body.itinerary)||body.itinerary.length>50||!Array.isArray(body.expenses)||body.expenses.length>50)fail('行程和费用最多各50项');
 v.itinerary=body.itinerary.map((r:any)=>{
  if(!r||typeof r!=='object')fail('行程格式无效');
  const row={start:text(r.start,5),end:text(r.end,5),activity:text(r.activity,500),location:text(r.location,50),custom_location:text(r.custom_location,200),people:r.people,note:text(r.note)};
  if([row.start,row.end].some(t=>t&&!VISIT_TIMES.includes(t))||row.start&&row.end&&row.end<=row.start)fail('行程时间请选择半小时间隔，结束时间需晚于开始时间');
  if(!VISIT_LOCATIONS.includes(row.location)||row.location==='其他'&&!row.custom_location)fail('请选择地点，其他地点需填写名称');
  if(!row.activity)fail('请填写行程事项');
  if(!Array.isArray(row.people)||row.people.length>30||row.people.some(p=>typeof p!=='string'||!people.some(s=>s.id===p)))fail('请选择有效的负责人和陪同人员');
  row.people=[...new Set<string>(row.people)];return row;
 });
 v.expenses=body.expenses.map((r:any)=>{if(!r||typeof r!=='object')fail('费用格式无效');const row={category:text(r.category,30),expected:text(r.expected,20),actual:text(r.actual,20)};if(!EXPENSE_CATEGORIES.includes(row.category))fail('请选择费用类别');try{visitCents(row.expected);visitCents(row.actual);}catch(e:any){fail(e.message);}return row;});
 return v;
}
export async function receptionReminders(db:D1Database,userId:string){
 const rows=await list(db,"SELECT r.id,r.payload,l.name AS customer_name FROM crm_visit_receptions r JOIN crm_leads l ON l.id=r.lead_id WHERE r.receptionist_id=? AND json_extract(r.payload,'$.completed')=1 ORDER BY r.updated",[userId]);
 return rows.flatMap(r=>{const v=JSON.parse(r.payload),s=expenseSummary(v.expenses);return s.missing.length?[{id:r.id,name:r.customer_name,date:v.date,missing:s.missing,expected:s.expected,actual:s.actual}]:[];});
}
export async function visitReceptionEndpoint(db:D1Database,u:any,actor:any,path:string,method:string,body:any,url:URL){
 if(!path.startsWith('visit-receptions'))return undefined;
 if(!can(u,'customers_all')&&u.role!=='sales')fail('没有到访记录访问权限',403);
 if(path==='visit-receptions/options'&&method==='GET')return {people:await roster(db)};
 if(path==='visit-receptions/customers'&&method==='GET'){
  const q=(url.searchParams.get('q')||'').trim().slice(0,100);
  const rows=await list(db,`SELECT l.id,l.name,l.country,l.grade,l.owner_id,u.name AS owner_name,l.detail FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id WHERE ${customerLeadSQL()} AND ${can(u,'customers_all')?'1=1':'l.owner_id=?'} AND (l.name LIKE ? OR l.country LIKE ?) ORDER BY l.name LIMIT 50`,[...(can(u,'customers_all')?[]:[u.id]),'%'+q+'%','%'+q+'%']);
  return {rows:rows.map(({detail,...r}:any)=>{const d=JSON.parse(detail||'{}');return {...r,area:String(d['项目面积']||d.area_m2||d['面积']||'')};})};
 }
 if(path==='visit-receptions'&&method==='GET'){
  const key=url.searchParams.get('id')||'';
  const q=(url.searchParams.get('q')||'').trim().slice(0,100),owner=url.searchParams.get('owner')||'',page=Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1));
  if(!Number.isSafeInteger(page))fail('页码无效');
  const where=(can(u,'customers_all')?'1=1':'(l.owner_id=? OR r.receptionist_id=?)')+(key?' AND r.id=?':' AND (l.name LIKE ? OR l.country LIKE ?)'+(owner?' AND r.receptionist_id=?':''));
  const args=[...(can(u,'customers_all')?[]:[u.id,u.id]),...(key?[key]:['%'+q+'%','%'+q+'%',...(owner?[owner]:[])])];
  const rows=await list(db,`SELECT r.*,l.name AS customer_name,l.country,l.grade,l.owner_id,u.name AS receptionist_name FROM crm_visit_receptions r JOIN crm_leads l ON l.id=r.lead_id LEFT JOIN crm_users u ON u.id=r.receptionist_id WHERE ${where} ORDER BY json_extract(r.payload,'$.date') DESC,r.updated DESC LIMIT 30 OFFSET ?`,[...args,key?0:(page-1)*30]);
  if(key&&!rows.length)fail('到访记录不存在或无权查看',404);
  const total=await db.prepare(`SELECT count(*) AS n FROM crm_visit_receptions r JOIN crm_leads l ON l.id=r.lead_id WHERE ${where}`).bind(...args).first<any>();
  return {rows:rows.map(({payload,...r}:any)=>({...r,...JSON.parse(payload),revision:r.revision,can_assign:authorizedLead(u,r)})),total:total?.n||0,page};
 }
 if(path==='visit-receptions'&&method==='POST'){
  if(!can(u,'customers_edit'))fail('没有客户维护权限',403);
  const old=typeof body?.id==='string'?await db.prepare('SELECT r.*,l.owner_id FROM crm_visit_receptions r JOIN crm_leads l ON l.id=r.lead_id WHERE r.id=?').bind(body.id).first<any>():null;
  const people=await roster(db),oldValue=old?JSON.parse(old.payload):null;
  // Inactive former participants remain readable/editable, but cannot be newly selected.
  const retained=oldValue?.itinerary?.flatMap((r:any)=>r.people)||[];
  const validationPeople=[...people,...retained.filter((p:string)=>!people.some(s=>s.id===p)).map((id:string)=>({id}))];
  const v=validate(body,validationPeople);
  const lead=await db.prepare('SELECT id,owner_id FROM crm_leads WHERE id=?').bind(v.lead_id).first<any>();
  if(!lead||(old?!access(u,old):!authorizedLead(u,lead)))fail('客户或到访记录不存在或无权维护',404);
  if(old&&old.lead_id!==v.lead_id)fail('已保存的到访记录不能更换客户');
  if(old&&!authorizedLead(u,old)&&old.receptionist_id!==v.receptionist_id)fail('只有客户负责人或管理人员可以更换接待业务员',403);
  if((!old||old.receptionist_id!==v.receptionist_id)&&!people.some(p=>p.id===v.receptionist_id&&salesRole(p.role)))fail('请选择在职接待业务员');
  if((old?.revision||'')!==v.revision)fail('记录已被更新，请重新打开后再修改',409);
  const revision=id(),at=now(),payload=JSON.stringify({...v,revision});
  const save=db.prepare(`INSERT INTO crm_visit_receptions(id,lead_id,receptionist_id,payload,revision,created,updated,updated_by) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_leads WHERE id=? AND owner_id IS ?) ON CONFLICT(id) DO UPDATE SET receptionist_id=excluded.receptionist_id,payload=excluded.payload,revision=excluded.revision,updated=excluded.updated,updated_by=excluded.updated_by WHERE crm_visit_receptions.revision=? AND crm_visit_receptions.lead_id=excluded.lead_id`).bind(v.id,v.lead_id,v.receptionist_id,payload,revision,at,at,actor.id,v.lead_id,lead.owner_id,v.revision);
  // Audit and current state commit together; stale edits append no audit event.
  const writes=await db.batch([save,db.prepare("INSERT INTO crm_sales_events(id,lead_id,kind,payload,occurred_at,created,created_by) SELECT ?,?,'客户接待登记',?,?,?,? WHERE changes()>0").bind(revision,v.lead_id,payload,at,at,actor.id)]);
  if(!writes[0].meta.changes)fail('记录或客户归属已变化，请重新打开后再修改',409);
  return {ok:true,id:v.id,revision};
 }
 fail('到访操作不存在',404);
}
