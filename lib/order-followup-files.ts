import {env} from 'cloudflare:workers';
import {AllocationError} from './allocation-server';
import {followupOrder,writeFollowup} from './order-followup-server';
export async function followupFiles(req:Request,db:D1Database,user:any,actor:any){
 const url=new URL(req.url),fileId=/^\/api\/followup\/files\/([a-z0-9-]+)$/.exec(url.pathname)?.[1];
 const file:any=fileId?await db.prepare('SELECT * FROM crm_followup_files WHERE id=?').bind(fileId).first():null;
 if(fileId&&!file)throw new AllocationError('文件不存在',404);
 const orderId=file?.order_id||url.searchParams.get('order_id')||'',access=await followupOrder(db,user,orderId);
 if(file&&req.method==='GET'){
  const object=await env.BUCKET?.get(file.object_key);if(!object)throw new AllocationError('文件暂不可用',404);
  return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(object.size),'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(url.pathname!=='/api/followup/files'||req.method!=='PUT')throw new AllocationError('附件操作不存在',404);
 if(!access.manager&&access.row.commercial_id!==user.id)throw new AllocationError('只有管理员及指定后勤可以上传附件',403);
 if(access.row.archived)throw new AllocationError('归档订单需重新打开后才能上传',409);
 if(!env.BUCKET)throw new AllocationError('文件存储尚未连接',503);
 const size=Number(req.headers.get('content-length')),step=Number(url.searchParams.get('step')),version=Number(url.searchParams.get('version'));
 if(!Number.isSafeInteger(size)||size<=0||size>100*1024*1024||!req.body)throw new AllocationError('请选择不超过100MB的文件',413);
 if(!Number.isInteger(step)||step<0||step>11)throw new AllocationError('请选择附件所属阶段');
 const name=(url.searchParams.get('name')||'').replace(/[\x00-\x1f/\\]/g,'_').slice(0,200);if(!name)throw new AllocationError('文件名不能为空');
 const kind=url.searchParams.get('kind')||'执行资料',previous=url.searchParams.get('previous_id')||null;
 if(!['执行资料','合同','PI','CI','报价','付款单据'].includes(kind))throw new AllocationError('文件类型无效');
 if(previous&&!await db.prepare('SELECT id FROM crm_followup_files WHERE id=? AND order_id=? AND document_kind=?').bind(previous,orderId,kind).first())throw new AllocationError('原版本不属于本单或类型不一致');
 const id=crypto.randomUUID(),key=`order-attachments/${orderId}/${id}`;
 const object=await env.BUCKET.put(key,req.body,{httpMetadata:{contentType:'application/octet-stream'}});
 try{
  const latest=await followupOrder(db,user,orderId);if(!latest.manager&&latest.row.commercial_id!==user.id)throw new AllocationError('跟单维护权限已撤销',403);
  if(!object||object.size!==size)throw new AllocationError('上传长度不一致，请重试');
  if(latest.row.archived)throw new AllocationError('订单已归档',409);
  await writeFollowup(db,latest.row,{version},actor,'上传附件',{id,name,size,step},(token,time)=>[db.prepare('INSERT INTO crm_followup_files(id,order_id,step,name,object_key,size,created,created_by,document_kind,previous_id) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_followup_orders WHERE id=? AND change_token=?)').bind(id,orderId,step,name,key,size,time,actor.id,kind,previous,orderId,token)],undefined,!!previous&&kind!=='执行资料');
 }catch(error){if(!await db.prepare('SELECT id FROM crm_followup_files WHERE id=?').bind(id).first())await env.BUCKET.delete(key);throw error;}
 return Response.json({id},{headers:{'Cache-Control':'no-store'}});
}
