import { BUSINESS_SCOPES } from '../allocation';
import { clean,id,now } from '../crm';
import { workflowAudit } from '../workflow-server';
import type { ApiContext } from './context';
import { json,Problem } from './http';
export async function financeRecords({db,req,path,body,user,actor}:ApiContext):Promise<Response|undefined>{
  if(path==='receipts'&&(req.method==='POST'||req.method==='PATCH')){
   if(user.role!=='admin')throw new Problem('只有管理员可以确认或撤销实际收款',403);
   if(req.method==='PATCH'){const reason=clean(body.reason);if(!reason)throw new Problem('请填写撤销收款原因；实际退款请单独登记');const result=await db.batch([db.prepare('UPDATE crm_receipts SET cancelled=1 WHERE id=? AND cancelled=0').bind(clean(body.id,100)),workflowAudit(db,actor,'撤销收款',body.id,{reason},true)]);if(!result[0].meta.changes)throw new Problem('有效收款不存在');return json({ok:true});}
   const deal:any=await db.prepare('SELECT * FROM crm_deals WHERE id=? AND cancelled=0').bind(clean(body.deal_id,100)).first();
   if(!deal)throw new Problem('请先确认有效成交单');
   const reference=clean(body.reference,100),currency=clean(body.currency,3),date=clean(body.received_date,10),amount=String(body.amount||''),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const minor=Math.round(Number(amount)*100);
   if(!reference||!['CNY','USD'].includes(currency)||!/^\d+(\.\d{1,2})?$/.test(amount)||!Number.isSafeInteger(minor)||minor<=0||minor>1_000_000_000_000)throw new Problem('请填写唯一收款凭证号、人民币或美元及有效正数金额（最多两位小数）');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>today)throw new Problem('请填写不晚于今天的有效收款日期');
   if(await db.prepare('SELECT id FROM crm_receipts WHERE reference=?').bind(reference).first())throw new Problem('此收款凭证号已登记，不可重复计算');
   await db.batch([db.prepare('INSERT INTO crm_receipts(id,reference,deal_id,amount_minor,currency,received_date,created,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id(),reference,deal.id,minor,currency,date,now(),actor.id),workflowAudit(db,actor,'确认收款',deal.id,{reference,amount_minor:minor,currency,received_date:date})]);return json({ok:true});
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
   const reason=clean(body.reason);if(!reason)throw new Problem('请填写撤销成交原因');const result=await db.batch([db.prepare('UPDATE crm_deals SET cancelled=1 WHERE id=? AND cancelled=0').bind(body.id),workflowAudit(db,actor,'撤销成交',body.id,{reason},true)]);if(!result[0].meta.changes)throw new Problem('有效成交不存在');return json({ok:true});
  }
}
