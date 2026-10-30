import {prepareContractArchive,type ArchiveStores} from './contract-archive';
import {AllocationError} from './allocation-server';
import {can,id,now} from './crm';
import {quoteAccount,quoteSnapshot} from './sales-quote-source';
import {executionQuote} from './order-execution-server';
import {followupAssignee,followupOrder} from './order-followup-server';
import {blankSteps} from './order-followup';
const fail=(s:string,status=400):never=>{throw new AllocationError(s,status);};
const required=(s:any,label:string)=>{if(typeof s!=='string'||!s.trim()||s.length>5000)fail('请填写'+label);return s.trim();};
function notice(db:D1Database,order:string,key:string,title:string,content:string,recipient:string){return db.prepare("INSERT OR IGNORE INTO crm_followup_notifications(id,dedupe_key,order_id,recipient_id,title,content,created) SELECT ?,?,o.id,u.id,?,?,? FROM crm_followup_orders o JOIN crm_users u ON u.id=? AND u.active=1 WHERE o.id=?").bind(id(),'confirmation:'+key+':'+recipient,title,content,now(),recipient,order);}
async function ownProject(db:D1Database,u:any,key:string){const p:any=await db.prepare('SELECT p.*,l.owner_id FROM crm_sales_projects p JOIN crm_leads l ON l.id=p.lead_id WHERE p.project_id=?').bind(key).first();if(!p||p.owner_id!==u.id||!can(u,'customers_edit'))fail('只有本项目所属业务员可以确认',403);return p;}
export async function confirmedWorkflow(db:D1Database,source:D1Database|undefined,u:any,actor:any,path:string,method:string,b:any,url:URL,stores?:ArchiveStores){
 if(!path.startsWith('confirmations/'))return undefined;
 if(u.id!==actor.id)fail('请切回本人账号确认',403);
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
 if(path==='confirmations/contract'&&method==='POST'){
  const p=await ownProject(db,u,b.project_id),old:any=await db.prepare('SELECT order_id FROM crm_contract_confirmations WHERE project_id=?').bind(p.project_id).first();if(old)return {ok:true,id:old.order_id};
  if(b.version!==p.version)fail('项目已更新，请刷新',409);
  if(!await db.prepare('SELECT id FROM crm_sales_quote_links WHERE project_id=? AND (quote_id=? OR EXISTS(SELECT 1 FROM crm_quote_acceptances a WHERE a.project_id=crm_sales_quote_links.project_id AND a.quote_id=?))').bind(p.project_id,b.quote_id,b.quote_id).first())fail('报价不属于本项目');
  const sourceData=await executionQuote(db,source,u,b.quote_id),follower:any=await db.prepare('SELECT * FROM crm_users WHERE id=? AND active=1').bind(b.logistics_id).first();
  if(!follower||!await followupAssignee(db,follower))fail('请选择有效跟单负责人');
  const evidence=required(b.reason,'合同确认依据'),time=now(),order=id(),deal=id();
  if(await db.prepare('SELECT id FROM crm_followup_orders WHERE order_number=?').bind(sourceData.contract_no).first())fail('已有同编号订单，请核对原订单，不会重复创建',409);
  const existingDeal:any=await db.prepare('SELECT * FROM crm_deals WHERE order_number=?').bind(sourceData.contract_no).first();if(existingDeal&&(existingDeal.lead_id!==p.lead_id||existingDeal.owner_id!==u.id||existingDeal.cancelled))fail('已有成交归属不一致，请核对',409);
  if(existingDeal){const original:any=await db.prepare('SELECT currency,total_minor FROM crm_workflow_contracts WHERE deal_id=?').bind(existingDeal.id).first();if(original&&(original.currency!==sourceData.currency||original.total_minor!==sourceData.amount_minor))fail('原成交合同金额与本次报价不一致，请先核对',409);}
  const lead:any=await db.prepare('SELECT business_scope FROM crm_leads WHERE id=? AND owner_id=?').bind(p.lead_id,u.id).first();if(!lead?.business_scope)fail('客户业务范围待补齐');
  const archive=await prepareContractArchive(db,source!,stores,order,b.quote_id,sourceData.files,actor.id);
  const details={dates:{},contract_source:{...sourceData,files:archive.files,evidence,confirmed_by:actor.id,confirmed_at:time},supply_scope:sourceData.supply_scope,payment_nodes:sourceData.payment_terms};
  const statements:D1PreparedStatement[]=[db.prepare('UPDATE crm_sales_projects SET details=CASE WHEN version=? AND EXISTS(SELECT 1 FROM crm_leads WHERE id=crm_sales_projects.lead_id AND owner_id=?) THEN details ELSE NULL END,version=version+1 WHERE project_id=?').bind(b.version,u.id,p.project_id)];
  if(!existingDeal)statements.push(db.prepare('INSERT INTO crm_deals(id,order_number,lead_id,owner_id,business_scope,deal_date,created,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(deal,sourceData.contract_no,p.lead_id,u.id,lead.business_scope,new Date(time).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),time,actor.id));
  statements.push(db.prepare('INSERT OR IGNORE INTO crm_workflow_contracts(deal_id,currency,total_minor,schedule,updated,updated_by) VALUES(?,?,?,?,?,?)').bind(existingDeal?.id||deal,sourceData.currency,sourceData.amount_minor,'[]',time,actor.id));
  statements.push(db.prepare('INSERT INTO crm_followup_orders(id,order_number,project,lead_id,deal_id,commercial_id,logistics_id,details,steps,change_token,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(order,sourceData.contract_no,p.name,p.lead_id,existingDeal?.id||deal,u.id,follower.id,JSON.stringify(details),JSON.stringify(blankSteps()),id(),time,actor.id,time,actor.id),db.prepare('INSERT INTO crm_contract_confirmations VALUES(?,?,?,?,?)').bind(p.project_id,order,b.quote_id,actor.id,time),db.prepare("INSERT INTO crm_followup_events(id,order_id,kind,payload,created,created_by) VALUES(?,?,'合同确认自动建单',?,?,?)").bind(id(),order,JSON.stringify({project_id:p.project_id,source:sourceData,reason:evidence}),time,actor.id));
  statements.push(db.prepare("UPDATE crm_sales_projects SET stage='won',stage_at=?,amount_minor=?,currency=?,details=json_set(details,'$.deal_id',?),updated=?,updated_by=? WHERE project_id=?").bind(time,sourceData.amount_minor,sourceData.currency,existingDeal?.id||deal,time,actor.id,p.project_id));
  statements.push(notice(db,order,'contract:'+p.project_id,'合同已确认，订单已建立',p.name+'｜请在订单跟单查看合同档案及执行要求',follower.id));
  try{await db.batch([...statements,...archive.statements]);}catch(e){await archive.cleanup();throw e;}return {ok:true,id:order};
 }
 if(path==='confirmations/documents'&&method==='POST'){
  const {row}=await followupOrder(db,u,b.order_id);if(row.commercial_id!==u.id||row.archived)fail('请本单销售确认同步商务文件',403);
  if(!row.details.contract_source?.quote_id||!source)fail('本单尚未关联报价');
  const archive=await prepareContractArchive(db,source!,stores,row.id,row.details.contract_source.quote_id,[],actor.id);
  try{if(archive.statements.length)await db.batch(archive.statements);}catch(e){await archive.cleanup();throw e;}return {ok:true,copied:archive.files.length};
 }
 if(path==='confirmations/releases'&&method==='GET'){
  return {rows:(await db.prepare("SELECT r.*,o.order_number,o.project,o.commercial_revision AS current_revision FROM crm_release_requests r JOIN crm_followup_orders o ON o.id=r.order_id WHERE ?='ceo' OR o.commercial_id=? OR o.logistics_id=? ORDER BY r.created DESC LIMIT 200").bind(u.role,u.id,u.id).all()).results};
 }
 if(path==='confirmations/release'&&method==='POST'){
  const {row}=await followupOrder(db,u,b.order_id);if(row.commercial_id!==u.id||row.archived)fail('只有本单销售可以确认付款或申请放行',403);
  if(!await db.prepare('SELECT project_id FROM crm_contract_confirmations WHERE order_id=?').bind(row.id).first())fail('历史订单沿用原应收与放行流程，不重复创建放行记录',409);
  if(!['payment','special'].includes(b.kind))fail('放行类型无效');const reason=required(b.reason,'付款确认或申请依据');
  if(b.kind==='payment'&&!await db.prepare("SELECT id FROM crm_followup_files f WHERE id=? AND order_id=? AND document_kind='付款单据' AND NOT EXISTS(SELECT 1 FROM crm_followup_files newer WHERE newer.previous_id=f.id)").bind(String(b.file_id||''),row.id).first())fail('请先上传本单付款单据');
  const key=required(b.request_id,'请求编号'),prior:any=await db.prepare('SELECT * FROM crm_release_requests WHERE id=?').bind(key).first();if(prior){if(prior.order_id!==row.id||prior.requested_by!==u.id||prior.kind!==b.kind||prior.reason!==reason||prior.evidence_file_id!==(b.kind==='payment'?b.file_id:null)||prior.commercial_revision!==row.commercial_revision)fail('请求编号冲突',409);return {ok:true,id:key};}
  const at=now(),statements=[db.prepare('INSERT INTO crm_release_requests(id,order_id,kind,state,reason,evidence_file_id,requested_by,created,decided_by,decided,decision,commercial_revision) SELECT ?,id,?,?,?,?,?,?,?,?,?,commercial_revision FROM crm_followup_orders WHERE id=? AND commercial_id=? AND archived=0 AND commercial_revision=?').bind(key,b.kind,b.kind==='payment'?'approved':'pending',reason,b.kind==='payment'?b.file_id:null,u.id,at,b.kind==='payment'?u.id:null,b.kind==='payment'?at:'',b.kind==='payment'?'销售确认付款':'',row.id,u.id,row.commercial_revision)];
  const recipients=b.kind==='payment'?[row.logistics_id]:(await db.prepare("SELECT id FROM crm_users WHERE role='ceo' AND active=1").all<any>()).results.map(u=>u.id);
  for(const recipient of recipients)statements.push(db.prepare("INSERT OR IGNORE INTO crm_followup_notifications(id,dedupe_key,order_id,recipient_id,title,content,created) SELECT ?,?,order_id,?,?,?,? FROM crm_release_requests WHERE id=?").bind(id(),'confirmation:'+key+':'+recipient,recipient,b.kind==='payment'?'销售已确认付款，可按指示放行':'特殊放行申请待CEO审批',row.order_number+'｜'+reason,at,key));
  const result=await db.batch(statements);if(!result[0].meta.changes)fail('订单资料或归属已变化，请刷新后确认',409);return {ok:true,id:key};
 }
 if(path==='confirmations/release/decision'&&method==='POST'){
  if(u.role!=='ceo')fail('只有CEO可以审批特殊放行',403);if(!['approved','rejected'].includes(b.state))fail('审批结果无效');
  const reason=required(b.reason,'审批说明'),at=now();
  const result=await db.batch([
   db.prepare("UPDATE crm_release_requests SET state=?,decided_by=?,decided=?,decision=? WHERE id=? AND kind='special' AND state='pending' AND commercial_revision=(SELECT commercial_revision FROM crm_followup_orders o WHERE o.id=crm_release_requests.order_id AND archived=0)").bind(b.state,u.id,at,reason,b.id),
   db.prepare("INSERT OR IGNORE INTO crm_followup_notifications(id,dedupe_key,order_id,recipient_id,title,content,created) SELECT r.id||':decision:'||p.id,'confirmation:'||r.id||':decision:'||p.id,o.id,p.id,?,?,? FROM crm_release_requests r JOIN crm_followup_orders o ON o.id=r.order_id JOIN crm_users p ON p.id IN (o.commercial_id,o.logistics_id) WHERE r.id=? AND r.decided=? AND r.decided_by=?").bind(b.state==='approved'?'CEO已批准特殊放行':'CEO已拒绝特殊放行',reason,at,b.id,at,u.id),
   db.prepare("UPDATE crm_followup_notifications SET resolved_at=? WHERE substr(dedupe_key,1,length(?))=? AND instr(dedupe_key,':decision:')=0 AND EXISTS(SELECT 1 FROM crm_release_requests r WHERE r.id=? AND r.state<>'pending')").bind(at,'confirmation:'+b.id+':','confirmation:'+b.id+':',b.id)
  ]);if(!result[0].meta.changes)fail('申请已处理或商务资料已变化，请重新核对',409);return {ok:true};
 }
 if(path==='confirmations/followers'&&method==='GET'){
  const users=(await db.prepare("SELECT id,name,role,permissions FROM crm_users WHERE active=1").all<any>()).results;const rows=[];for(const person of users)if(await followupAssignee(db,person))rows.push({id:person.id,name:person.name});return {rows};
 }
 fail('确认操作不存在',404);
}
