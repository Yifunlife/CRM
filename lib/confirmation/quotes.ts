import { id,now } from '../crm';
import { quoteAccount,quoteSnapshot } from '../sales-quote-source';
import type { ConfirmationContext } from './context';
import { fail } from './errors';
export async function quoteAcceptance({db,source,u,actor,path,method,b}:ConfirmationContext){
 if(path==='confirmations/quotes'&&method==='GET'){
  const email=await quoteAccount(db,source,u);if(!email)return {rows:[],message:'请由已绑定报价账号的所属业务员接收报价'};
  const ready=(await source!.prepare("SELECT q.id,q.project_name,q.customer_name,q.contract_no,m.created_at FROM quotation_history q JOIN quotation_crm_messages m ON m.quotation_id=q.id WHERE m.kind='业务员确认报价' AND m.author=? AND q.voided_at IS NULL AND q.archived_at IS NULL AND q.project_status<>'lost' ORDER BY m.created_at DESC LIMIT 200").bind(email).all<any>()).results;
  const accepted=(await db.prepare('SELECT quote_id FROM crm_quote_acceptances').all<any>()).results;
  return {rows:ready.filter(q=>!accepted.some(a=>a.quote_id===q.id))};
 }
 if(path==='confirmations/quote'&&method==='POST'){
  const email=await quoteAccount(db,source,u);if(!email)fail('请由所属业务员接收',403);
  const ready=await source!.prepare("SELECT id FROM quotation_crm_messages WHERE quotation_id=? AND author=? AND kind='业务员确认报价'").bind(b.quote_id,email).first();if(!ready)fail('报价尚未经本人在报价系统确认',409);
  const lead:any=await db.prepare('SELECT * FROM crm_leads WHERE id=? AND owner_id=?').bind(b.lead_id,u.id).first();if(!lead)fail('请选择本人负责的客户',403);
  const snapshot=await quoteSnapshot(db,source,u,b.quote_id);if(!snapshot.available)fail('报价已失效',409);
  const old:any=await db.prepare('SELECT * FROM crm_quote_acceptances WHERE quote_id=?').bind(b.quote_id).first();if(old){if(old.lead_id!==lead.id)fail('该报价已关联其他客户',409);return {ok:true,id:old.project_id};}
  const previous:any=await db.prepare('SELECT q.*,p.lead_id FROM crm_sales_quote_links q JOIN crm_sales_projects p ON p.project_id=q.project_id WHERE q.source_key=?').bind(snapshot.source_key).first();
  if(previous&&previous.lead_id!==lead.id)fail('同一报价系列已关联其他客户，请核对',409);
  const project=previous?.project_id||id(),time=now(),token=id(),statements:D1PreparedStatement[]=[];
  if(!previous)statements.push(db.prepare("INSERT INTO crm_sales_projects(project_id,name,lead_id,stage,stage_at,details,token,created,created_by,updated,updated_by) VALUES(?,?,?,'quoted',?,?,?,?,?,?,?)").bind(project,snapshot.project_name,lead.id,time,JSON.stringify({contract_no:snapshot.contract_no}),token,time,actor.id,time,actor.id));
  if(previous)statements.push(db.prepare('UPDATE crm_sales_quote_links SET quote_id=?,summary=?,synced=?,updated=?,updated_by=?,version=version+1 WHERE id=?').bind(b.quote_id,JSON.stringify(snapshot),time,time,actor.id,previous.id));
  else statements.push(db.prepare('INSERT INTO crm_sales_quote_links(id,project_id,quote_id,source_key,summary,synced,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id(),project,b.quote_id,snapshot.source_key,JSON.stringify(snapshot),time,time,actor.id,time,actor.id));
  statements.push(db.prepare('INSERT INTO crm_quote_acceptances VALUES(?,?,?,?,?)').bind(b.quote_id,project,lead.id,actor.id,time),db.prepare("INSERT INTO crm_sales_events(id,project_id,lead_id,kind,payload,occurred_at,created,created_by) VALUES(?,?,?,'确认接收报价',?,?,?,?)").bind(id(),project,lead.id,JSON.stringify({quote_id:b.quote_id,after:snapshot}),time,time,actor.id));
  statements.push(db.prepare('UPDATE crm_sales_projects SET details=CASE WHEN EXISTS(SELECT 1 FROM crm_leads WHERE id=crm_sales_projects.lead_id AND owner_id=?) THEN details ELSE NULL END WHERE project_id=?').bind(u.id,project));
  try{await db.batch(statements);}catch(e){const accepted:any=await db.prepare('SELECT project_id,lead_id FROM crm_quote_acceptances WHERE quote_id=?').bind(b.quote_id).first();if(accepted?.lead_id===lead.id)return {ok:true,id:accepted.project_id};throw e;}return {ok:true,id:project};
 }
}
