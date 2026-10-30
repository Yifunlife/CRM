import {AllocationError} from './allocation-server';
import {authorizedLead,can} from './crm';
const kind='合同文件归档';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
const parse=(s:string)=>{try{return JSON.parse(s);}catch{return {};}};
async function access(db:D1Database,user:any,id:string){const lead:any=await db.prepare('SELECT id,name,owner_id FROM crm_leads WHERE id=?').bind(id).first();if(!lead||!authorizedLead(user,lead))fail('客户不存在或无权查看',404);return lead;}
const editable=(user:any,lead:any)=>can(user,'customers_edit')&&(user.role==='admin'||user.role==='sales'&&lead.owner_id===user.id);
export async function contractFiles(req:Request,db:D1Database,bucket:R2Bucket|undefined,user:any,actor:any){
 if(!['admin','sales','ceo','management'].includes(user.role))fail('没有合同文件访问权限',403);
 const url=new URL(req.url),path=url.pathname.slice(5),json=(data:any)=>Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
 if(path==='contract-files/customers'&&req.method==='GET'){
  const q=(url.searchParams.get('q')||'').trim().slice(0,100),all=can(user,'customers_all');
  const args:any[]=[];let where='1=1';if(!all){where+=' AND owner_id=?';args.push(user.id);}if(q){where+=" AND (name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')";const pattern='%'+q.replace(/[\\%_]/g,c=>'\\'+c)+'%';args.push(pattern,pattern);}
  const rows=await db.prepare(`SELECT id,name,phone FROM crm_leads WHERE ${where} ORDER BY created DESC,id LIMIT 50`).bind(...args).all();return json({items:rows.results});
 }
 const fileId=/^contract-files\/([a-z0-9-]+)$/.exec(path)?.[1];
 if(fileId&&req.method==='GET'){
  const row:any=await db.prepare('SELECT lead_id,payload FROM crm_sales_events WHERE id=? AND kind=?').bind(fileId,kind).first();if(!row)fail('合同文件不存在',404);await access(db,user,row.lead_id);const file=parse(row.payload),object=await bucket?.get(file.object_key);if(!object)return fail('文件暂不可用',404);
  return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(object.size),'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(path!=='contract-files')fail('合同文件操作不存在',404);
 const leadId=url.searchParams.get('lead_id')||'',lead=await access(db,user,leadId);
 if(req.method==='GET'){
  const rows=await db.prepare('SELECT e.id,e.project_id,e.payload,e.created,u.name AS uploaded_by,p.name AS project_name FROM crm_sales_events e LEFT JOIN crm_users u ON u.id=e.created_by LEFT JOIN crm_sales_projects p ON p.project_id=e.project_id WHERE e.lead_id=? AND e.kind=? ORDER BY e.created DESC,e.id').bind(leadId,kind).all();
  const projects=await db.prepare('SELECT project_id,name FROM crm_sales_projects WHERE lead_id=? ORDER BY updated DESC').bind(leadId).all();
  return json({lead:{id:lead.id,name:lead.name},can_upload:editable(user,lead),projects:projects.results,items:rows.results.map((r:any)=>{const f=parse(r.payload);return {id:r.id,name:f.name,size:f.size,status:f.status,project_id:r.project_id,project_name:r.project_name,created:r.created,uploaded_by:r.uploaded_by,url:'/api/contract-files/'+r.id};})});
 }
 if(req.method!=='PUT')fail('不支持此合同操作',405);if(!editable(user,lead))fail('只有客户所属业务员或管理员可以上传合同',403);if(!bucket)return fail('文件存储尚未连接',503);
 const name=(url.searchParams.get('name')||'').replace(/[\x00-\x1f/\\]/g,'_').slice(0,200),size=Number(req.headers.get('content-length')),status=url.searchParams.get('status')||'',projectId=url.searchParams.get('project_id')||null;
 if(!/\.(pdf|docx?|xlsx?|png|jpe?g|webp)$/i.test(name))fail('请选择 PDF、Word、Excel 或图片合同');if(!['已填写','已签署'].includes(status))fail('请选择合同状态');if(!Number.isSafeInteger(size)||size<=0||size>100*1024*1024||!req.body)fail('请选择不超过100MB的合同文件',413);
 if(projectId&&!await db.prepare('SELECT project_id FROM crm_sales_projects WHERE project_id=? AND lead_id=?').bind(projectId,leadId).first())fail('项目不属于所选客户');
 const id=crypto.randomUUID(),key='customer-contracts/'+leadId+'/'+id,time=new Date().toISOString();
 try{
  const object=await bucket.put(key,req.body,{httpMetadata:{contentType:'application/octet-stream'}});if(!object||object.size!==size)fail('上传长度不一致，请重试');
  const latest=await access(db,user,leadId);if(!editable(user,latest))fail('客户上传权限已变化，请刷新重试',403);
  const result=await db.prepare('INSERT INTO crm_sales_events(id,project_id,lead_id,kind,payload,occurred_at,created,created_by) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_leads WHERE id=? AND owner_id IS ?) AND (? IS NULL OR EXISTS(SELECT 1 FROM crm_sales_projects WHERE project_id=? AND lead_id=?))').bind(id,projectId,leadId,kind,JSON.stringify({object_key:key,name,size,status}),time,time,actor.id,leadId,latest.owner_id,projectId,projectId,leadId).run();
  if(!result.meta.changes)fail('客户或项目已变化，请刷新重试',409);
 }catch(error){await bucket.delete(key);throw error;}
 return json({id,name,url:'/api/contract-files/'+id});
}
