import {crmMonthlyCohort,monthlyAcquiredLeads} from './crm-monthly-cohort';
import {acquisitionDashboard} from './operations-dashboard';
import {operationsReport,reportDay} from './operations-report';
import {customerChanges} from './customer-changes';
import {AllocationError} from './allocation-server';
import {authorizedLead,can,id,now} from './crm';
import {AD_PLATFORMS} from './advertising';
import {AD_ACCOUNT_PLATFORMS} from './operations';
import {SOURCE_KINDS,LOSS_REASONS,QUALITY_STATES} from './attribution';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
function required(value:any,label:string,max=2000){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('请填写'+label);return value.trim();}
function admin(user:any,actor:any){if(user.role!=='admin'||actor.role!=='admin')fail('只有管理员可以确认归因',403);}
const mappings:any={lead:{table:'crm_attribution_leads',key:'lead_id'},deal:{table:'crm_attribution_deals',key:'deal_id'},spend:{table:'crm_attribution_spend',key:'ad_id'}};
function audit(db:D1Database,actor:any,kind:string,entity:string,payload:any,condition='1',args:any[]=[]){return db.prepare('INSERT INTO crm_attribution_events(id,kind,entity_id,payload,created,created_by) SELECT ?,?,?,?,?,? WHERE '+condition).bind(id(),kind,entity,JSON.stringify(payload),now(),actor.id,...args);}
async function leadAccess(db:D1Database,user:any,key:string){const row:any=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(key).first();if(!row||!authorizedLead(user,row))fail('咨询不存在或无权查看',404);return row;}
async function related(db:D1Database,a:string,b:string){return a===b||!!await db.prepare('SELECT 1 FROM crm_customer_subject_links a JOIN crm_customer_subject_links b ON a.subject_id=b.subject_id WHERE a.lead_id=? AND b.lead_id=?').bind(a,b).first();}
async function proposal(db:D1Database,user:any,kind:string,entity:string,body:any){
 if(!mappings[kind])fail('请选择咨询、成交或广告费用');
 if(kind==='spend'){
  if(!can(user,'advertising_edit'))fail('没有广告维护权限',403);
  const ad:any=await db.prepare('SELECT * FROM crm_advertising WHERE id=?').bind(entity).first();if(!ad)fail('广告记录不存在',404);
  if(body.campaign_id){const c:any=await db.prepare('SELECT * FROM crm_attribution_campaigns WHERE id=?').bind(body.campaign_id).first();if(!c||c.platform!==ad.platform||c.account_id!==ad.account_id)fail('活动须与原广告的平台和账号一致');}
  return {campaign_id:body.campaign_id||null};
 }
 if(!can(user,'customers_edit'))fail('没有客资维护权限',403);
 if(kind==='deal'){
  const d:any=await db.prepare('SELECT * FROM crm_deals WHERE id=?').bind(entity).first();if(!d)fail('成交不存在',404);await leadAccess(db,user,d.lead_id);
  if(body.lead_id){if(d.cancelled)fail('已撤销成交不能建立归因');await leadAccess(db,user,body.lead_id);if(!await related(db,d.lead_id,body.lead_id))fail('来源咨询须为成交原咨询，或已确认同一客户主体的咨询');}
  return {lead_id:body.lead_id||null};
 }
 await leadAccess(db,user,entity);
 if(!SOURCE_KINDS.includes(body.source_kind))fail('请选择来源类型');
 const assists=body.assists||[];if(!Array.isArray(assists)||assists.length>20||assists.some(v=>typeof v!=='string')||new Set(assists).size!==assists.length)fail('辅助来源重复或数量超过20项');
 if(body.source_kind==='广告活动'&&!body.campaign_id)fail('请选择主要活动');
 if(body.source_kind!=='广告活动'&&body.campaign_id)fail('非广告来源不能设置主要广告活动');
 if(assists.includes(body.campaign_id))fail('主要活动不能同时列为辅助来源');
 for(const key of [...assists,...(body.campaign_id?[body.campaign_id]:[])])if(!await db.prepare('SELECT id FROM crm_attribution_campaigns WHERE id=?').bind(key).first())fail('活动不存在');
 return {source_kind:body.source_kind,campaign_id:body.campaign_id||null,assists};
}
export async function closingOutcome(db:D1Database,lead:any,body:any,actor:any){
 if(body.status!=='已结束'||await db.prepare('SELECT id FROM crm_deals WHERE lead_id=? AND cancelled=0').bind(lead.id).first())return [];
 if(!LOSS_REASONS.includes(body.loss_reason))fail('结束未成交咨询时请选择未成交原因');
 const note=required(body.loss_note,'未成交核查说明');
 const before=await db.prepare('SELECT * FROM crm_lead_outcomes WHERE lead_id=?').bind(lead.id).first();
 return [db.prepare('INSERT INTO crm_lead_outcomes(lead_id,reason,note,version,updated,updated_by) VALUES(?,?,?,1,?,?) ON CONFLICT(lead_id) DO UPDATE SET reason=excluded.reason,note=excluded.note,version=crm_lead_outcomes.version+1,updated=excluded.updated,updated_by=excluded.updated_by').bind(lead.id,body.loss_reason,note,now(),actor.id),audit(db,actor,'记录未成交原因',lead.id,{before,reason:body.loss_reason,note})];
}
export async function attributionEndpoint(db:D1Database,user:any,actor:any,path:string,method:string,body:any,url:URL){
 if(!path.startsWith('attribution/'))return undefined;
 if(method==='GET'&&path==='attribution/report')return report(db,user,url);
 if(method!=='POST')fail('操作不存在',404);
 if(!body||typeof body!=='object'||Array.isArray(body))fail('请求格式无效');
 if(path==='attribution/campaigns'){
  admin(user,actor);const name=required(body.name,'活动名称',200),reason=required(body.reason,'建档依据'),account:any=await db.prepare('SELECT * FROM crm_operation_accounts WHERE id=? AND active=1').bind(body.account_id).first();
  if(!Object.hasOwn(AD_PLATFORMS,body.platform)||!account||account.currency!==AD_PLATFORMS[body.platform as keyof typeof AD_PLATFORMS]||!AD_ACCOUNT_PLATFORMS[body.platform].includes(account.platform))fail('请选择匹配平台的运营账号');
  const key=id(),code='AD-'+key;await db.batch([db.prepare('INSERT INTO crm_attribution_campaigns(id,code,name,platform,account_id,created,created_by) VALUES(?,?,?,?,?,?,?)').bind(key,code,name,body.platform,account.id,now(),actor.id),audit(db,actor,'建立活动',key,{name,platform:body.platform,account_id:account.id,reason})]);return {ok:true,id:key};
 }
 if(path==='attribution/propose'){
  const payload=await proposal(db,user,body.kind,body.entity_id,body),m=mappings[body.kind],current:any=await db.prepare(`SELECT * FROM ${m.table} WHERE ${m.key}=?`).bind(body.entity_id).first();
  if(body.target_version!==(current?.version||0))fail('归因已变化，请刷新后重新提报',409);
  const reason=required(body.reason,'归因依据'),key=id();await db.prepare('INSERT INTO crm_attribution_requests(id,kind,entity_id,payload,reason,target_version,token,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(key,body.kind,body.entity_id,JSON.stringify(payload),reason,body.target_version,id(),now(),actor.id,now(),actor.id).run();return {ok:true,id:key};
 }
 if(path==='attribution/resolve'){
  admin(user,actor);const r:any=await db.prepare('SELECT * FROM crm_attribution_requests WHERE id=?').bind(body.id).first();if(!r||r.state!=='待核查'||body.version!==r.version)fail('提报已处理，请刷新',409);
  if(!['确认','驳回'].includes(body.decision))fail('请选择确认或驳回');const reason=required(body.reason,'核查结论'),token=id(),time=now();
  if(body.decision==='驳回'){const result=await db.batch([db.prepare("UPDATE crm_attribution_requests SET state='已驳回',version=version+1,token=?,decision_reason=?,updated=?,updated_by=? WHERE id=? AND state='待核查' AND version=?").bind(token,reason,time,actor.id,r.id,r.version),audit(db,actor,'驳回归因',r.entity_id,{request_id:r.id,reason},'changes()>0')]);if(!result[0].meta.changes)fail('提报已变化',409);return {ok:true};}
  const payload:any=await proposal(db,user,r.kind,r.entity_id,JSON.parse(r.payload)),m=mappings[r.kind],before=await db.prepare(`SELECT * FROM ${m.table} WHERE ${m.key}=?`).bind(r.entity_id).first();
  const guard='EXISTS(SELECT 1 FROM crm_attribution_requests WHERE id=? AND token=?)',guardArgs=[r.id,token];
  const fields=Object.keys(payload),values=fields.map(k=>k==='assists'?JSON.stringify(payload[k]):payload[k]);
  const result=await db.batch([
   db.prepare(`UPDATE crm_attribution_requests SET state='已确认',version=version+1,token=?,decision_reason=?,updated=?,updated_by=? WHERE id=? AND state='待核查' AND version=? AND COALESCE((SELECT version FROM ${m.table} WHERE ${m.key}=?),0)=?`).bind(token,reason,time,actor.id,r.id,r.version,r.entity_id,r.target_version),
   db.prepare(`INSERT INTO ${m.table}(${m.key},${fields.join(',')},version,updated,updated_by) SELECT ?,${fields.map(()=>'?').join(',')},?,?,? WHERE ${guard} ON CONFLICT(${m.key}) DO UPDATE SET ${fields.map(k=>k+'=excluded.'+k).join(',')},version=excluded.version,updated=excluded.updated,updated_by=excluded.updated_by`).bind(r.entity_id,...values,r.target_version+1,time,actor.id,...guardArgs),
   audit(db,actor,'确认归因',r.entity_id,{kind:r.kind,request_id:r.id,before,after:payload,reason},guard,guardArgs)
  ]);if(!result[0].meta.changes)fail('归因或提报已变化，请重新核查',409);return {ok:true};
 }
 if(path==='attribution/quality'||path==='attribution/outcome'){
  if(!can(user,'customers_edit'))fail('没有客资维护权限',403);const lead=await leadAccess(db,user,body.lead_id),quality=path.endsWith('/quality'),table=quality?'crm_attribution_quality':'crm_lead_outcomes';
  const before:any=await db.prepare('SELECT * FROM '+table+' WHERE lead_id=?').bind(lead.id).first();if(body.version!==(before?.version||0))fail('核查记录已变化，请刷新',409);
  let fields:string[],values:string[];
  if(quality){if(!QUALITY_STATES.includes(body.state))fail('请选择有效性结论');fields=['state','reason'];values=[body.state,required(body.reason,'核查依据')];}
  else{if(lead.status!=='已结束'||await db.prepare('SELECT id FROM crm_deals WHERE lead_id=? AND cancelled=0').bind(lead.id).first())fail('只有已结束且未成交的咨询可填写未成交原因');if(!LOSS_REASONS.includes(body.loss_reason))fail('请选择未成交原因');fields=['reason','note'];values=[body.loss_reason,required(body.loss_note,'核查说明')];}
  const result=await db.batch([db.prepare(`INSERT INTO ${table}(lead_id,${fields.join(',')},version,updated,updated_by) SELECT ?,?,?,1,?,? WHERE COALESCE((SELECT version FROM ${table} WHERE lead_id=?),0)=? ON CONFLICT(lead_id) DO UPDATE SET ${fields.map(f=>f+'=excluded.'+f).join(',')},version=${table}.version+1,updated=excluded.updated,updated_by=excluded.updated_by WHERE ${table}.version=?`).bind(lead.id,...values,now(),actor.id,lead.id,body.version,body.version),audit(db,actor,quality?'核查咨询有效性':'更正未成交原因',lead.id,{before,after:Object.fromEntries(fields.map((f,i)=>[f,values[i]]))},'changes()>0')]);if(!result[0].meta.changes)fail('核查记录已变化，请刷新',409);return {ok:true};
 }
 fail('操作不存在',404);
}

async function report(db:D1Database,user:any,url:URL){
 const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
 for(const d of [from,to])if(d&&(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d))fail('日期格式不正确');if(from&&to&&from>to)fail('开始日期不能晚于结束日期');
 const inRange=(d:string)=>(!from||d>=from)&&(!to||d<=to),all=can(user,'customers_all'),adView=can(user,'advertising_view'),scope=all?'':' WHERE owner_id=?';
 const rows=async(sql:string,args:any[]=[])=> (await db.prepare(sql).bind(...args).all<any>()).results;
 const leads=await rows('SELECT id,name,source,country,business_scope,next_date,channel,owner_id,original_owner,created,entered,status,grade,last_contact FROM crm_leads'+scope,all?[]:[user.id]),leadIds=new Set(leads.map(l=>l.id));
 const allDeals=await rows('SELECT id,lead_id,order_number,deal_date,cancelled FROM crm_deals'),deals=allDeals.filter(d=>leadIds.has(d.lead_id));
 const campaigns=await rows('SELECT c.*,a.name AS account_name,a.currency FROM crm_attribution_campaigns c JOIN crm_operation_accounts a ON a.id=c.account_id');
 const attrs=(await rows('SELECT * FROM crm_attribution_leads')).filter(a=>leadIds.has(a.lead_id)),quality=(await rows('SELECT * FROM crm_attribution_quality')).filter(a=>leadIds.has(a.lead_id)),outcomes=(await rows('SELECT * FROM crm_lead_outcomes')).filter(a=>leadIds.has(a.lead_id));
 const dAttrs=await rows('SELECT * FROM crm_attribution_deals'),subjects=await rows('SELECT lead_id,subject_id FROM crm_customer_subject_links');
 const subject=new Map(subjects.map(s=>[s.lead_id,s.subject_id]));
 const isRelated=(a:string,b:string)=>a===b||!!subject.get(a)&&subject.get(a)===subject.get(b);
 const visibleDeals=deals.map(d=>{const a=dAttrs.find(a=>a.deal_id===d.id);return {...d,attribution:a&&(!a.lead_id||leadIds.has(a.lead_id))?{...a,valid:!!a.lead_id&&isRelated(d.lead_id,a.lead_id)}:null};});
 const ads=adView?await rows('SELECT * FROM crm_advertising'):[],spend=adView?await rows('SELECT * FROM crm_attribution_spend'):[];
 const buckets=new Map<string,any>();
 function bucket(key:string,label:string,currency:string){const k=key+':'+currency;if(!buckets.has(k))buckets.set(k,{key,label,currency,consultations:0,valid_consultations:0,deals:0,spent_minor:0,received_minor:0,refunded_minor:0,net_minor:0,roas:null});return buckets.get(k);}
 function source(leadId:string){const a=attrs.find(a=>a.lead_id===leadId);if(!a||a.source_kind==='未知来源')return {key:'pending',label:'待核查／未知来源',currency:''};if(a.source_kind!=='广告活动')return {key:a.source_kind,label:a.source_kind,currency:''};const c=campaigns.find(c=>c.id===a.campaign_id);return c?{key:c.id,label:c.name,currency:c.currency}:{key:'pending',label:'待核查／未知来源',currency:''};}
 for(const c of campaigns)bucket(c.id,c.name,c.currency);
 for(const l of leads){const date=new Date(l.created).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});if(inRange(date)){const s=source(l.id),b=bucket(s.key,s.label,s.currency);b.consultations++;if(quality.find(q=>q.lead_id===l.id)?.state==='有效')b.valid_consultations++;}}
 function dealSource(d:any){return d.attribution?.valid?source(d.attribution.lead_id):{key:'pending',label:'待核查／未知来源',currency:''};}
 const validDeals=visibleDeals.filter(d=>!d.cancelled),dealMap=new Map(validDeals.map(d=>[d.id,d]));
 for(const d of validDeals)if(inRange(d.deal_date)){const s=dealSource(d);bucket(s.key,s.label,s.currency).deals++;}
 const receipts=(await rows('SELECT id,deal_id,currency,amount_minor,received_date FROM crm_receipts WHERE cancelled=0')).filter(r=>dealMap.has(r.deal_id));
 for(const r of receipts)if(inRange(r.received_date)){const s=dealSource(dealMap.get(r.deal_id));bucket(s.key,s.label,r.currency).received_minor+=r.amount_minor;}
 for(const f of await rows('SELECT receipt_id,amount_minor,refunded_date FROM crm_workflow_refunds')){const r=receipts.find(r=>r.id===f.receipt_id);if(r&&inRange(f.refunded_date)){const s=dealSource(dealMap.get(r.deal_id));bucket(s.key,s.label,r.currency).refunded_minor+=f.amount_minor;}}
 const pendingSpend=[],spendRecorded=new Set<string>();
 for(const ad of ads){if(ad.status==='作废')continue;const link=spend.find(s=>s.ad_id===ad.id),c=campaigns.find(c=>c.id===link?.campaign_id);const valid=ad.spend_basis==='daily'&&c&&c.account_id===ad.account_id&&c.platform===ad.platform&&c.currency===ad.currency;if(!valid)pendingSpend.push({id:ad.id,reason:ad.spend_basis!=='daily'?'历史累计费用不可按日归集':'活动未确认或平台账号已变化'});if(valid&&inRange(ad.date))spendRecorded.add(c.id);if(inRange(ad.date))bucket(valid?c.id:'pending-spend',valid?c.name:'未归因广告费用',ad.currency).spent_minor+=ad.spend_basis==='daily'?ad.spent:0;}
 const totals=[...buckets.values()].map(b=>({...b,net_minor:b.received_minor-b.refunded_minor,roas:adView&&all&&campaigns.some(c=>c.id===b.key&&c.currency===b.currency)&&b.spent_minor>0?(b.received_minor-b.refunded_minor)/b.spent_minor:null}));
 const names=await rows('SELECT id,name FROM crm_users');
 const decorated=leads.map(l=>({...l,owner_name:names.find(n=>n.id===l.owner_id)?.name||'',attribution:attrs.find(a=>a.lead_id===l.id)||null,quality:quality.find(a=>a.lead_id===l.id)||null,outcome:outcomes.find(a=>a.lead_id===l.id)||null,has_deal:deals.some(d=>d.lead_id===l.id&&!d.cancelled)}));
 const requests=[];for(const r of await rows('SELECT r.*,u.name AS proposer FROM crm_attribution_requests r JOIN crm_users u ON u.id=r.created_by ORDER BY r.created DESC')){const p=JSON.parse(r.payload);if(r.kind==='lead'&&leadIds.has(r.entity_id)||r.kind==='deal'&&deals.some(d=>d.id===r.entity_id)&&(!p.lead_id||leadIds.has(p.lead_id))||r.kind==='spend'&&adView)requests.push({...r,payload:p});}
 const intakes=await rows('SELECT id,state,target_lead_id FROM crm_customer_pool'),intakeIds=new Set(intakes.map(r=>r.id)),pendingIds=new Set(intakes.filter(r=>r.state!=='已入CRM'&&!r.target_lead_id).map(r=>r.id));
 const operations=all&&adView?operationsReport({leads:decorated.filter(l=>!pendingIds.has(l.id)).map(l=>intakeIds.has(l.id)?{...l,entered:reportDay(l.created)}:l),campaigns,attrs,quality,subjects,deals,summary:totals,from,to,asOf:reportDay(new Date().toISOString()),spendRecorded:[...spendRecorded]}):null;
 const monthlyContracts=operations?await rows('SELECT deal_id,currency,total_minor FROM crm_workflow_contracts'):[];
 const dashboard=operations?acquisitionDashboard({report:operations,leads:decorated,campaigns,subjects,deals,receipts,outcomes,notes:await rows('SELECT lead_id,created FROM crm_notes'),assignments:await rows('SELECT lead_id,created FROM crm_assignments'),contracts:monthlyContracts,refunds:await rows('SELECT receipt_id,amount_minor,refunded_date FROM crm_workflow_refunds')}):null;
 const monthly=operations?crmMonthlyCohort({report:operationsReport({leads:monthlyAcquiredLeads(decorated.filter(l=>!pendingIds.has(l.id)),intakeIds),campaigns,attrs,quality,subjects,deals,summary:[],from:'',to:'',asOf:operations.as_of,spendRecorded:[]}),leads:monthlyAcquiredLeads(decorated.filter(l=>!pendingIds.has(l.id)),intakeIds),campaigns,subjects,deals,contracts:monthlyContracts}):null;
 return {operations,dashboard,monthly,changes:await customerChanges(db,user,all),from,to,campaigns:campaigns.map(c=>adView?c:{id:c.id,code:c.code,name:c.name,platform:c.platform,currency:c.currency}),leads:decorated,deals:visibleDeals.map(d=>({...d,source_options:leads.filter(l=>isRelated(d.lead_id,l.id)).map(l=>l.id)})),ads:ads.map(a=>({...a,attribution:spend.find(s=>s.ad_id===a.id)||null})),accounts:adView?await rows('SELECT id,name,platform,currency,active FROM crm_operation_accounts'):[],requests,summary:totals.map(b=>adView?{...b,roas:all?b.roas:null}:{...b,spent_minor:null,roas:null}),pending_spend:pendingSpend,events:user.role==='admin'?await rows('SELECT e.*,u.name AS actor_name FROM crm_attribution_events e JOIN crm_users u ON u.id=e.created_by ORDER BY e.created DESC LIMIT 200'):[],can_edit:can(user,'customers_edit'),can_ad_edit:can(user,'advertising_edit'),full_scope:all,ad_view:adView};
}
