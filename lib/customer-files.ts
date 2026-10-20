import { env } from 'cloudflare:workers';
import { ownedDesktop } from './workbench-bridge';
import { AllocationError } from './allocation-server';

export async function customerFiles(req:Request,db:D1Database,user:any,actor:any):Promise<Response>{
 if(!['admin','sales'].includes(user.role))throw new AllocationError('无权查看客户附件',403);
 const owner:any=user.role==='admin'?await db.prepare("SELECT id FROM crm_users WHERE id=COALESCE((SELECT owner_id FROM crm_workbench_snapshots ORDER BY updated LIMIT 1),(SELECT id FROM crm_users WHERE username='winnie')) AND active=1 AND role='sales'").first():user;
 if(!owner)throw new AllocationError('客户账号不存在',404);
 const url=new URL(req.url),download=/^\/api\/workbench\/files\/([a-z0-9-]+)$/.exec(url.pathname);
 const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'no-store'}});
 if(download&&req.method==='GET'){
  const row:any=await db.prepare('SELECT * FROM crm_files WHERE id=? AND owner_id=?').bind(download[1],owner.id).first();
  if(!row)throw new AllocationError('文件不存在或无权查看',404);
  await ownedDesktop(db,owner.id,row.desktop_id);
  const object=await env.BUCKET?.get(row.object_key);
  if(!object)throw new AllocationError('文件暂不可用',404);
  return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(object.size),'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(url.pathname!=='/api/workbench/files')throw new AllocationError('附件操作不存在',404);
 const desktopId=url.searchParams.get('desktop_id')||'';
 await ownedDesktop(db,owner.id,desktopId);
 if(req.method==='GET')return json((await db.prepare('SELECT id,name,size,created FROM crm_files WHERE owner_id=? AND desktop_id=? ORDER BY created DESC').bind(owner.id,desktopId).all()).results.map((f:any)=>({...f,url:`/api/workbench/files/${f.id}`})));
 if(req.method!=='PUT')throw new AllocationError('不支持此附件操作',405);
 if(!env.BUCKET)throw new AllocationError('文件存储尚未连接',503);
 const size=Number(req.headers.get('content-length'));
 if(!Number.isSafeInteger(size)||size<=0||size>100*1024*1024||!req.body)throw new AllocationError('请选择不超过100MB的文件',413);
 const name=(url.searchParams.get('name')||'').replace(/[\x00-\x1f/\\]/g,'_').slice(0,200);
 if(!name)throw new AllocationError('文件名不能为空');
 const id=crypto.randomUUID(),key=`attachments/${owner.id}/${id}`;
 const object=await env.BUCKET.put(key,req.body,{httpMetadata:{contentType:'application/octet-stream'}});
 try{
  // Recheck ownership after the upload before publishing its link.
  await ownedDesktop(db,owner.id,desktopId);
  if(!object||object.size!==size)throw new AllocationError('上传长度不一致，请重试');
  await db.prepare('INSERT INTO crm_files(id,owner_id,desktop_id,object_key,name,size,created,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id,owner.id,desktopId,key,name,object.size,new Date().toISOString(),actor.id).run();
 }catch(error){await env.BUCKET.delete(key);throw error;}
 return json({id,url:`/api/workbench/files/${id}`,name,size});
}
