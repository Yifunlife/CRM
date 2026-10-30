import {AllocationError} from './allocation-server';
import {id,now} from './crm';
export type ArchiveStores={source?:R2Bucket;destination?:R2Bucket};
export async function prepareContractArchive(db:D1Database,source:D1Database,stores:ArchiveStores|undefined,order:string,quote:string,handoverFiles:any[],actor:string){
 const files:any[]=[];
 for(const f of handoverFiles){const row:any=await source.prepare('SELECT id,filename,object_key,size,sha256 FROM quotation_handover_files WHERE id=? AND quotation_id=?').bind(f.id,quote).first();if(!row)throw new AllocationError('报价附件缺失，请先核对',409);files.push({...row,kind:'合同',source_id:'handover:'+row.id});}
 if(await source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='trade_documents'").first()){
  const docs=(await source.prepare("SELECT d.id,d.filename,d.pdf_key AS object_key,d.pdf_hash AS sha256,d.kind FROM trade_documents d JOIN quotation_history q ON q.id=? AND d.owner=q.created_by WHERE json_extract(d.data_json,'$.sourceQuotationId')=q.id ORDER BY d.created_at,d.id").bind(quote).all<any>()).results;
  files.push(...docs.map(d=>({...d,kind:String(d.kind).toLowerCase().endsWith('-pi')?'PI':String(d.kind).toLowerCase().endsWith('-ci')?'CI':['PI','CI'].includes(d.kind)?d.kind:'合同',source_id:'trade:'+d.id})));
 }
 const copied:any[]=[],statements:D1PreparedStatement[]=[];
 const cleanup=async()=>{for(const f of copied)if(!await db.prepare('SELECT id FROM crm_followup_files WHERE id=?').bind(f.id).first())await stores!.destination!.delete(f.object_key);};
 try{
  for(const f of files){
   if(await db.prepare("SELECT id FROM crm_followup_events WHERE order_id=? AND kind='同步商务文件' AND json_extract(payload,'$.source_id')=?").bind(order,f.source_id).first())continue;
   if(!stores?.source||!stores.destination)throw new AllocationError('商务文件存储尚未连接，未创建不完整订单',503);
   const object=await stores.source.get(f.object_key);if(!object)throw new AllocationError('商务文件不存在，请先核对',409);
   const bytes=await object.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
   if(f.sha256&&hash!==f.sha256)throw new AllocationError('商务文件校验失败，请先核对',409);
   const key=id(),objectKey='order-attachments/'+order+'/'+key,at=now();
   await stores.destination.put(objectKey,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
   copied.push({id:key,name:f.filename,object_key:objectKey,url:'/api/followup/files/'+key,source_id:f.source_id});
   statements.push(db.prepare('INSERT INTO crm_followup_files(id,order_id,step,name,object_key,size,created,created_by,document_kind) VALUES(?,?,0,?,?,?,?,?,?)').bind(key,order,f.filename,objectKey,bytes.byteLength,at,actor,f.kind),db.prepare("INSERT INTO crm_followup_events(id,order_id,kind,payload,created,created_by) VALUES(?,?,'同步商务文件',?,?,?)").bind(id(),order,JSON.stringify({source_id:f.source_id,file_id:key,name:f.filename,sha256:hash}),at,actor));
  }
  return {files:copied,statements,cleanup};
 }catch(e){await cleanup();throw e;}
}
