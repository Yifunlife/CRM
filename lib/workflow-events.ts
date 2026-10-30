import {refreshFollowupNotifications} from './followup-notifications';
import {refreshQuoteBridge} from './quote-bridge';
import {quoteSnapshot} from './sales-quote-source';

// Invoke only after a permitted operation commits. Never replay its confirmation.
export async function afterWorkflowWrite(db:D1Database,source:D1Database|undefined,result:any,target:{project?:string;order?:string}){
 try{
  if(target.project){const sync=await refreshQuoteBridge(db,source,target.project);if(!sync.available)throw Error('Quote bridge unavailable');}
  if(target.order)await refreshFollowupNotifications(db,undefined,target.order);
 }catch{
  const reference=crypto.randomUUID();
  console.error(JSON.stringify({event:'crm.operation-sync',request_id:reference,project_id:target.project,order_id:target.order,outcome:'failed'}));
  result.message='业务记录已保存；关联同步暂未完成，请在报价协作中重试同步，或请管理员核查通知。排查编号：'+reference;
 }
 return result;
}

// Called only through the quotation Worker's private service binding.
export async function syncQuotationChange(db:D1Database,source:D1Database,quoteId:string){
 if(typeof quoteId!=='string'||!quoteId.trim()||quoteId.length>200)throw Error('Invalid quotation ID');
 const snapshot=await quoteSnapshot(db,source,{id:'quote-bridge',role:'admin',permissions:'{}'},quoteId);
 const projects=(await db.prepare('SELECT DISTINCT project_id FROM crm_sales_quote_links WHERE source_key=? OR quote_id=?').bind(snapshot.source_key,quoteId).all<{project_id:string}>()).results;
 for(const p of projects)await refreshQuoteBridge(db,source,p.project_id);
 return {ok:true,projects:projects.length};
}
