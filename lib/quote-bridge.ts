import {AllocationError} from './allocation-server';
import {authorizedLead,can,id,now} from './crm';
import {quoteSnapshot} from './sales-quote-source';
const fail=(m:string,s=400):never=>{throw new AllocationError(m,s);};
const read=(s:string)=>JSON.parse(s||'{}');
const normalized=(s:string)=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export const contractBase=(s:string)=>normalized(s).replace(/-r\d+$/i,'');
const list=async(db:D1Database,s:string,args:any[]=[]) =>(await db.prepare(s).bind(...args).all<any>()).results;
const system={id:'quote-bridge',role:'admin',permissions:'{}'};
export async function bridgeAvailable(source?:D1Database){return !!source&&!!await source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='quotation_crm_messages'").first();}
async function projects(db:D1Database){return list(db,`SELECT p.*,COALESCE(c.name,p.name) AS name,l.owner_id,u.name AS sales_name,u.active AS sales_active,a.quote_email FROM crm_sales_projects p JOIN crm_leads l ON l.id=p.lead_id LEFT JOIN crm_customer_projects c ON c.id=p.customer_project_id LEFT JOIN crm_users u ON u.id=l.owner_id LEFT JOIN crm_sales_account_links a ON a.user_id=l.owner_id`);}
export async function refreshQuoteBridge(db:D1Database,source?:D1Database,onlyProject=''){
 if(!await bridgeAvailable(source))return {available:false,linked:0,incoming:0,outgoing:0,pending:[]};
 const src=source!,ps=await projects(db),allLinks=await list(db,'SELECT * FROM crm_sales_quote_links'),result={available:true,linked:0,incoming:0,outgoing:0,pending:[] as any[]};
 const ready=await list(src,"SELECT m.*,q.project_name,q.contract_no,q.voided_at,q.archived_at,q.project_status FROM quotation_crm_messages m JOIN quotation_history q ON q.id=m.quotation_id WHERE m.direction='quote' ORDER BY m.created_at");
 // New links require BOTH the exact project name and contract family; ambiguous matches never auto-link.
 for(const m of ready){if(allLinks.some(l=>read(l.summary).versions?.some((v:any)=>v.id===m.quotation_id)))continue;
  if(m.voided_at||m.archived_at||m.project_status==='lost')continue;
  const matches=ps.filter(p=>normalized(p.name)===normalized(m.project_name)&&read(p.details).contract_no&&contractBase(read(p.details).contract_no)===contractBase(m.contract_no));
  if(matches.length!==1){if(!onlyProject||ps.some(p=>p.project_id===onlyProject&&normalized(p.name)===normalized(m.project_name)))result.pending.push({quote_id:m.quotation_id,project_name:m.project_name,contract_no:m.contract_no,reason:matches.length?'项目名与合同号匹配多个项目':'尚未找到项目名及合同号都一致的CRM项目'});continue;}
  const p=matches[0];if(onlyProject&&p.project_id!==onlyProject)continue;
  if(!p.owner_id||!p.sales_active)continue;
  const summary:any=await quoteSnapshot(db,src,system,m.quotation_id),existing=allLinks.find(l=>l.source_key===summary.source_key);if(existing)continue;
  const key=id(),time=now();summary.bridge_shared=true;
  const r=await db.prepare('INSERT OR IGNORE INTO crm_sales_quote_links(id,project_id,quote_id,source_key,summary,synced,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(key,p.project_id,m.quotation_id,summary.source_key,JSON.stringify(summary),time,time,p.created_by,time,p.created_by).run();
  if(r.meta.changes){result.linked++;allLinks.push({id:key,project_id:p.project_id,quote_id:m.quotation_id,source_key:summary.source_key,summary:JSON.stringify(summary),created_by:p.created_by});}
 }
 const selected=onlyProject?ps.filter(p=>p.project_id===onlyProject):ps;
 for(const p of selected){const links=allLinks.filter(l=>l.project_id===p.project_id),validIds=new Set<string>(),currentIds=new Set<string>();
  for(const l of links){const summary:any=await quoteSnapshot(db,src,system,l.quote_id);if(summary.source_key!==l.source_key)continue;
   // An existing explicitly confirmed link is authoritative even if legacy labels differ.
   summary.bridge_shared=true;currentIds.add(summary.current_id);await db.prepare('UPDATE crm_sales_quote_links SET summary=?,synced=?,sync_error=\'\',version=version+1 WHERE id=?').bind(JSON.stringify(summary),now(),l.id).run();
   for(const version of summary.versions){validIds.add(version.id);await src.prepare(`INSERT INTO quotation_crm_links(quotation_id,project_id,project_name,contract_no,sales_id,sales_name,sales_email,active,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(quotation_id) DO UPDATE SET project_id=excluded.project_id,project_name=excluded.project_name,contract_no=excluded.contract_no,sales_id=excluded.sales_id,sales_name=excluded.sales_name,sales_email=excluded.sales_email,active=excluded.active,updated_at=excluded.updated_at`).bind(version.id,p.project_id,p.name,version.contract_no,p.owner_id||'',p.sales_name||'待确认',p.sales_active?p.quote_email||'':'',p.sales_active?1:0,now()).run();}
  }
  for(const old of await list(src,'SELECT quotation_id FROM quotation_crm_links WHERE project_id=? AND active=1',[p.project_id]))if(!validIds.has(old.quotation_id))await src.prepare('UPDATE quotation_crm_links SET active=0,sales_email=\'\',updated_at=? WHERE quotation_id=?').bind(now(),old.quotation_id).run();
  for(const m of ready.filter(m=>validIds.has(m.quotation_id))){
   const payload={...read(m.body_json),quote_id:m.quotation_id,quote_author:m.author,source_message:m.id},eventId='quote-'+m.id;
   await db.prepare('INSERT OR IGNORE INTO crm_sales_events(id,project_id,lead_id,kind,payload,occurred_at,created,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(eventId,p.project_id,p.lead_id,m.kind,JSON.stringify(payload),m.created_at,now(),p.created_by).run();
   const answered=await db.prepare("SELECT id FROM crm_sales_events WHERE project_id=? AND kind IN ('报价已发送','反馈','修改要求','客户接受报价','合同客户确认') AND json_extract(payload,'$.quote_id')=? AND created>=? LIMIT 1").bind(p.project_id,m.quotation_id,m.created_at).first();
   const resolved=!currentIds.has(m.quotation_id)||!!answered||!!m.voided_at||!!m.archived_at||m.project_status==='lost'||!p.sales_active;
   await db.prepare("UPDATE crm_sales_notifications SET resolved_at=? WHERE dedupe_key LIKE ? AND recipient_id<>?").bind(now(),'quote-ready:'+m.id+':%',p.owner_id||'').run();
   if(p.sales_active){await db.prepare(`INSERT INTO crm_sales_notifications(id,dedupe_key,project_id,lead_id,recipient_id,title,content,created,resolved_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO UPDATE SET resolved_at=excluded.resolved_at,title=excluded.title,content=excluded.content`).bind(id(),'quote-ready:'+m.id+':'+p.owner_id,p.project_id,p.lead_id,p.owner_id,m.kind+'：'+m.project_name,m.contract_no+'\n'+payload.content+'\n请打开报价与协作，记录发送结果或客户反馈。',m.created_at,resolved?now():'').run();}
   result.incoming++;
  }
  // CRM is the outbox: identical event IDs make retries safe after a network interruption.
  const events=await list(db,"SELECT e.*,u.name AS author FROM crm_sales_events e JOIN crm_users u ON u.id=e.created_by WHERE e.project_id=? AND e.kind IN ('报价已发送','反馈','修改要求','客户接受报价','合同客户确认')",[p.project_id]);
  for(const e of events){const body=read(e.payload);if(!validIds.has(body.quote_id))continue;const r=await src.prepare("INSERT OR IGNORE INTO quotation_crm_messages(id,quotation_id,project_id,direction,kind,body_json,author,created_at) VALUES(?,?,?,'crm',?,?,?,?)").bind('crm-'+e.id,body.quote_id,p.project_id,e.kind,JSON.stringify({content:body.content,customer_action:body.customer_action,next_action:body.next_action,evidence:body.evidence}),e.author,e.created).run();if(r.meta.changes)result.outgoing++;}
 }
 return result;
}
export async function quoteBridgeEndpoint(db:D1Database,source:D1Database|undefined,u:any,actor:any,path:string,method:string,body:any,url:URL){
 if(!path.startsWith('sales-suite/bridge'))return undefined;
 if(u.role==='followup')fail('跟单员仅访问本人订单',403);
 const key=method==='GET'?url.searchParams.get('project'):body.project_id,p=(await projects(db)).find(p=>p.project_id===key);if(!p||!authorizedLead(u,{owner_id:p.owner_id}))return fail('项目不存在或无权查看',404);
 if(method==='POST'){
  if(!can(u,'customers_edit'))fail('没有本项目维护权限',403);
  if(path==='sales-suite/bridge/identity'){
   if(typeof body.contract_no!=='string'||!body.contract_no.trim()||body.contract_no.length>100||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>2000)fail('请填写项目合同号及对应依据');
   if(body.version!==p.version)fail('项目已更新，请刷新',409);
   const details={...read(p.details),contract_no:body.contract_no.trim()},token=id(),time=now();
   const r=await db.batch([db.prepare('UPDATE crm_sales_projects SET details=?,version=version+1,token=?,updated=?,updated_by=? WHERE project_id=? AND version=?').bind(JSON.stringify(details),token,time,actor.id,p.project_id,p.version),db.prepare("INSERT INTO crm_sales_events(id,project_id,lead_id,kind,payload,occurred_at,created,created_by) SELECT ?,?,?,'确认项目合同对应',?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_sales_projects WHERE project_id=? AND token=?)").bind(id(),p.project_id,p.lead_id,JSON.stringify({before:read(p.details).contract_no||'',after:details.contract_no,reason:body.reason}),time,time,actor.id,p.project_id,token)]);if(!r[0].meta.changes)fail('项目已更新，请刷新',409);
  }else if(path!=='sales-suite/bridge/sync')fail('协作操作不存在',404);
  return refreshQuoteBridge(db,source,p.project_id);
 }
 if(method!=='GET')fail('请求方法不支持',405);
 const available=await bridgeAvailable(source),links=await list(db,'SELECT summary,sync_error,synced FROM crm_sales_quote_links WHERE project_id=?',[p.project_id]);
 const candidates=available?await list(source!,"SELECT DISTINCT q.id,q.project_name,q.contract_no FROM quotation_history q JOIN quotation_crm_messages m ON m.quotation_id=q.id WHERE m.direction='quote' AND trim(q.project_name)=? AND q.voided_at IS NULL AND q.archived_at IS NULL LIMIT 50",[p.name.trim()]):[];
 return {available,project_name:p.name,contract_no:read(p.details).contract_no||'',links:links.map(l=>({...l,summary:read(l.summary)})),candidates,events:await list(db,"SELECT kind,payload,occurred_at FROM crm_sales_events WHERE project_id=? AND kind IN ('核算报价完成','核算回复') ORDER BY created DESC LIMIT 100",[p.project_id])};
}
