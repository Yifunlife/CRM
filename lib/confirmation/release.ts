import { id,now } from '../crm';
import { followupOrder } from '../order-followup-server';
import type { ConfirmationContext } from './context';
import { fail,required } from './errors';
export async function releaseConfirmation({db,u,actor,path,method,b}:ConfirmationContext){
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
}
