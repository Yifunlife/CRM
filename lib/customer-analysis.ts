import {readManualCommunication,saveManualCommunication} from './communication-manual';
import {authorizedLead,clean,digest} from './crm';
import {customerProfile,canEditCustomerProfile} from './customer-profile';
import {readJson} from './object-storage';
import {ownedDesktop} from './workbench-bridge';
import {AllocationError} from './allocation-server';

// Command results are the durable analysis record, separate from manual customer fields.
export async function customerAnalysisEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any){
 const match=/^customer-analysis\/([^/]+)$/.exec(path);if(!match)return undefined;
 if(!['GET','POST'].includes(method))throw new AllocationError('分析仅支持读取和生成',405);
 const lead:any=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(match[1]).first();
 if(!lead||!authorizedLead(user,lead))throw new AllocationError('客户不存在或无权查看',404);
 const link:any=await db.prepare('SELECT desktop_id FROM crm_workbench_links WHERE lead_id=? AND owner_id=?').bind(lead.id,lead.owner_id).first();
 if(method==='POST'&&body?.mode==='manual')return saveManualCommunication(db,user,actor,lead,body);
 const bridgeStatus:any=method==='GET'&&link?await db.prepare('SELECT seen,status FROM crm_workbench_bridge WHERE owner_id=?').bind(lead.owner_id).first():null;
 const extra=method==='GET'?{manual:await readManualCommunication(db,lead),can_edit_manual:canEditCustomerProfile(user,lead),linked:!!link,online:!!bridgeStatus&&Date.now()-bridgeStatus.seen<30000,supported:!!bridgeStatus&&!!JSON.parse(bridgeStatus.status||'{}').customerAnalysis,can_generate:user.id===actor.id}:{};
 if(!link){if(method==='GET')return {analysis:null,workbench_analysis:null,job:null,...extra};throw new AllocationError('此客户尚未关联所属业务员的工作台，请先同步并核对客户关联',409);}
 const args=[lead.owner_id,link.desktop_id,lead.id];
 const where="owner_id=? AND desktop_id=? AND kind='customer-analysis' AND json_extract(payload,'$.crm_lead_id')=?";
 if(method==='GET'){
  const saved:any=await db.prepare(`SELECT result,updated FROM crm_workbench_commands WHERE ${where} AND state='done' ORDER BY created DESC,id DESC LIMIT 1`).bind(...args).first();
  const latest:any=await db.prepare(`SELECT id,state,result FROM crm_workbench_commands WHERE ${where} ORDER BY created DESC,id DESC LIMIT 1`).bind(...args).first();
  const result=latest?await readJson(latest.result):null;
  const analysis=saved?(await readJson(saved.result)).analysis:null;
  const workbench_analysis=analysis?{fields:{customerNeeds:analysis.needs,confirmedFacts:analysis.confirmed,pendingItems:analysis.pending,nextAction:analysis.nextStep},source:analysis.source,generated_at:analysis.updatedAt,synced_at:new Date(saved.updated).toISOString(),total_messages:analysis.messageCount,analyzed_messages:analysis.messageCount,stale:!!lead.last_contact&&Date.parse(lead.last_contact)>Date.parse(analysis.updatedAt)}:null;
  return {analysis,workbench_analysis,...extra,job:latest?{id:latest.id,state:latest.state,error:clean(result?.error,300)}:null};
 }
 if(user.id!==actor.id)throw new AllocationError('请退出代看身份后生成分析',403);
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(body.request_id||''))throw new AllocationError('分析请求编号无效');
 await ownedDesktop(db,lead.owner_id,link.desktop_id);
 const jobId='analysis-'+await digest(actor.id+':'+body.request_id);
 const prior:any=await db.prepare('SELECT id,owner_id,desktop_id,kind,payload,state FROM crm_workbench_commands WHERE id=?').bind(jobId).first();
 if(prior){if(prior.owner_id!==lead.owner_id||prior.desktop_id!==link.desktop_id||prior.kind!=='customer-analysis'||JSON.parse(prior.payload).crm_lead_id!==lead.id)throw new AllocationError('分析请求编号冲突',409);return {id:prior.id,state:prior.state};}
 const bridge:any=await db.prepare('SELECT seen,status FROM crm_workbench_bridge WHERE owner_id=?').bind(lead.owner_id).first();
 if(!bridge||Date.now()-bridge.seen>=30000)throw new AllocationError('所属业务员的工作台离线，请打开工作台后再生成',409);
 if(!JSON.parse(bridge.status||'{}').customerAnalysis)throw new AllocationError('当前工作台尚未加载客户分析功能，请更新并重启工作台',409);
 const pending:any=await db.prepare(`SELECT id,state FROM crm_workbench_commands WHERE ${where} AND state IN ('queued','running') ORDER BY created DESC LIMIT 1`).bind(...args).first();
 if(pending)return pending;
 const queued:any=await db.prepare("SELECT COUNT(*) n FROM crm_workbench_commands WHERE owner_id=? AND state IN ('queued','running')").bind(lead.owner_id).first();
 if(queued.n>=20)throw new AllocationError('工作台正在处理，请稍后重试',429);
 const notes=(await db.prepare('SELECT id,method,content,next_step,created FROM crm_notes WHERE lead_id=? ORDER BY created DESC,rowid DESC LIMIT 12').bind(lead.id).all<any>()).results.reverse().map(n=>({...n,content:clean(n.content,2000),next_step:clean(n.next_step,500)}));
 const profile=customerProfile(lead),payload={crm_lead_id:lead.id,context:{notes,manualBlocker:profile.blocker,nextStep:profile.nextAction,nextDate:lead.next_date||''}};
 const timestamp=Date.now();
 await db.prepare("INSERT OR IGNORE INTO crm_workbench_commands(id,owner_id,desktop_id,kind,payload,state,created,updated,actor_id) SELECT ?,?,?,'customer-analysis',?,'queued',?,?,? WHERE EXISTS(SELECT 1 FROM crm_leads l JOIN crm_workbench_links w ON w.lead_id=l.id AND w.owner_id=l.owner_id WHERE l.id=? AND l.owner_id=? AND w.desktop_id=?) AND NOT EXISTS(SELECT 1 FROM crm_workbench_commands WHERE owner_id=? AND desktop_id=? AND kind='customer-analysis' AND state IN ('queued','running'))").bind(jobId,lead.owner_id,link.desktop_id,JSON.stringify(payload),timestamp,timestamp,actor.id,lead.id,lead.owner_id,link.desktop_id,lead.owner_id,link.desktop_id).run();
 const job:any=await db.prepare(`SELECT id,state FROM crm_workbench_commands WHERE ${where} AND state IN ('queued','running') ORDER BY created DESC LIMIT 1`).bind(...args).first();
 if(!job)throw new AllocationError('客户关联或归属已变化，请刷新后重试',409);
 return job;
}
