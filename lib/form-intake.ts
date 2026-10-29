import {businessDetail} from './customer-business-detail';
import {can,clean,digest,emailKey,id,now,phoneKey} from './crm';
import {AllocationError,allocationWeights,distribute} from './allocation-server';
import {BUSINESS_SCOPES} from './allocation';
import {enquiryNotification} from './lead-notifications';

const time=(value:any)=>Number.isFinite(Date.parse(value))?Date.parse(value):Infinity;
const keys=(row:any)=>[phoneKey(row.phone).length>=7?'p:'+phoneKey(row.phone):'',emailKey(row.email)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailKey(row.email))?'e:'+emailKey(row.email):''].filter(Boolean);
const ordered=(a:any,b:any)=>time(a.occurred||a.entered||a.created)-time(b.occurred||b.entered||b.created)||String(a.id).localeCompare(String(b.id));
export function formRow(raw:any,scope=''){
 const value=(cn:string,en:string)=>clean(raw[cn]??raw[en]);
 const occurred=clean(raw.created_time||raw['录入日期']);
 if(!raw.id||!raw.form_id||!Number.isFinite(time(occurred))||!/(Z|[+-]\d\d:\d\d)$/.test(occurred))throw new AllocationError('表单编号、表单ID或带时区的提交时间缺失，请核查原表');
 const name=value('客户名称','full_name'),phone=value('联系方式','work_phone_number'),email=value('邮箱','work_email');
 const form=clean(raw.form_name),business_scope=scope||(form.includes('全案')?'meta-full':/场景|玩具号/.test(form)?'meta-product':'');
 return {id:clean(raw.id,200),name,phone,email,country:value('所在国家/地区','country'),occurred:new Date(occurred).toISOString(),business_scope,raw,
  requirement:value('项目需求描述','briefly_describe_your_project_needs')||value('项目类型','what_type_of_project_are_you_planning?')||'需求待补充'};
}

// Group the whole batch before allocating. Contact bridges cannot split a customer across owners.
export function groupForms(rows:any[]){
 const parent=rows.map((_,i)=>i),seen=new Map<string,number>();
 const root=(i:number):number=>parent[i]===i?i:(parent[i]=root(parent[i]));
 rows.forEach((r,i)=>{for(const key of [...keys(r),...(r.links||[])]){const other=seen.get(key);if(other!==undefined)parent[root(i)]=root(other);else seen.set(key,i);}});
 const groups=new Map<number,any[]>();rows.forEach((r,i)=>{const key=root(i);if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(r);});
 return [...groups.values()].map(g=>g.sort(ordered)).sort((a,b)=>ordered(a[0],b[0]));
}

export async function importForms(db:D1Database,rawRows:any[],actor:string,options:{scope?:string;filename?:string;preview?:boolean;allocate?:boolean}={}){
 const user=await db.prepare('SELECT role,permissions FROM crm_users WHERE id=? AND active=1').bind(actor).first<any>();
 if(!user||!can(user,'customers_edit')||!can(user,'customers_all'))throw new AllocationError('表单入库需要全公司客户查看及维护权限',403);
 const rows:any[]=[...new Map(rawRows.map(r=>{const row=formRow(r,options.scope);return [row.id,row];})).values()];
 if(rows.length>10000)throw new AllocationError('表单批次超过10000条，请分批处理');
 const token=id(),acquired=Date.now();
 if(!options.preview){
  const lock=await db.prepare("INSERT INTO crm_form_import_lock(id,token,expires) VALUES('meta',?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE expires<?").bind(token,acquired+600000,acquired).run();
  if(!lock.meta.changes)throw new AllocationError('另一批表单正在入库，请稍后重试',409);
 }
 // Fencing makes every transaction roll back if a newer worker has acquired the expired lease.
 const guard=()=>db.prepare("UPDATE crm_form_import_lock SET expires=CASE WHEN token=? AND expires>? THEN ? ELSE NULL END WHERE id='meta'").bind(token,Date.now(),Date.now()+600000);
 let pending:D1PreparedStatement[]=[];
 const flush=async()=>{if(pending.length&&!options.preview){await db.batch([guard(),...pending]);pending=[];}};
 const commit=async(statements:D1PreparedStatement[])=>{if(options.preview)return;if(pending.length+statements.length>80)await flush();pending.push(...statements);};
 const result={inserted:0,repeated:0,skipped:0,reviewed:0,unmatched:0,autoAssigned:0,allocationWarning:'',groups:[] as any[]};
 try{
  const leads=(await db.prepare('SELECT l.*,u.active AS owner_active FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id').all<any>()).results;
  const submissions=(await db.prepare('SELECT id,lead_id,phone,email,kind FROM crm_form_submissions').all<any>()).results;
  const known=new Set(submissions.map(r=>r.id)),byFingerprint=new Map(leads.map(l=>[l.fingerprint,l]));
  const contacts=new Map<string,Set<string>>(),leadById=new Map(leads.map(l=>[l.id,l]));
  const index=(r:any,leadId:string)=>{for(const k of keys(r)){if(!contacts.has(k))contacts.set(k,new Set());contacts.get(k)!.add(leadId);}};
  leads.forEach(l=>index(l,l.id));submissions.filter(s=>s.lead_id).forEach(s=>index(s,s.lead_id));
  for(const r of rows){r.fingerprint=await digest('Meta:lead:'+r.id);r.links=[...new Set(keys(r).flatMap(k=>[...(contacts.get(k)||[])])).values()].map(key=>'lead:'+key);const old=byFingerprint.get(r.fingerprint);if(old)r.links.push('lead:'+old.id);}
  const batchId=id(),at=now(),allocate=new Set<string>();
  if(!options.preview)await commit([db.prepare('INSERT INTO crm_batches(id,filename,source,created,creator,total) VALUES(?,?,?,?,?,?)').bind(batchId,options.filename||'Google表单抓取','Meta',at,actor,rows.length)]);
  for(const group of groupForms(rows)){
   const candidates=new Set<string>();
   for(const r of group){for(const k of keys(r))for(const key of contacts.get(k)||[])candidates.add(key);const old=byFingerprint.get(r.fingerprint);if(old)candidates.add(old.id);}
   const existing=[...candidates].map(key=>leadById.get(key)).filter(Boolean).sort(ordered);
   const owners=new Set(existing.map(l=>l.owner_id).filter(Boolean));
   const assigned=existing.filter(l=>l.owner_id);
   let lead=assigned[0]||existing[0];
   const first=group[0],fresh=group.filter(r=>!known.has(r.id)&&!byFingerprint.has(r.fingerprint));
   result.skipped+=group.length-fresh.length;
   // Only resume assignment for leads created by this form pipeline, never sweep historical waiting leads.
   for(const r of group){const s=submissions.find(s=>s.id===r.id&&s.kind==='new');if(s?.lead_id)allocate.add(s.lead_id);}
   if(!fresh.length)continue;
   const reason=owners.size>1?'相同联系方式对应多个负责人，请核查归属':lead?.owner_id&&!lead.owner_active?'原负责人已停用，请先交接':lead&&!lead.owner_id&&!allocate.has(lead.id)?'已有客户尚未分配，请核查原归属':!first.name||!keys(first).length?'姓名或有效联系方式不完整':!BUSINESS_SCOPES.some(s=>s.id===first.business_scope&&s.source==='Meta')?'业务范围待确认':'';
   if(reason){
    for(const r of fresh){
     const poolId='form-'+await digest(r.id),payload={name:r.name,phone:r.phone,email:r.email,country:r.country,business_scope:r.business_scope,requirement:r.requirement,summary:'表单再次提交，待核查',source_kind:'未知来源',campaign_id:'',attribution_reason:''};
     await commit([
      db.prepare("INSERT OR IGNORE INTO crm_customer_pool(id,source,raw,payload,last_error,created,updated,created_by) VALUES(?,'Meta',?,?,?,?,?,?)").bind(poolId,JSON.stringify(r.raw),JSON.stringify(payload),reason,r.occurred,at,actor),
      db.prepare("INSERT OR IGNORE INTO crm_form_submissions(id,lead_id,phone,email,occurred,raw,kind,created) VALUES(?,NULL,?,?,?,?, 'review',?)").bind(r.id,r.phone,r.email,r.occurred,JSON.stringify(r.raw),at)
     ]);known.add(r.id);result.reviewed++;
    }
    result.groups.push({name:first.name,action:'待核查',reason,count:fresh.length});continue;
   }
   const isNew=!lead;
   if(isNew){
    lead={id:'form-'+await digest(first.id),name:first.name,phone:first.phone,email:first.email,country:first.country,owner_id:null,entered:first.occurred,created:at,review:0,business_scope:first.business_scope};
    leadById.set(lead.id,lead);result.inserted++;
   }
   const statements:D1PreparedStatement[]=[];
   if(isNew){
    const detail={...businessDetail(first.raw),'客户名称':first.name,'联系方式':first.phone,'邮箱':first.email,'所在国家/地区':first.country,'录入日期':first.occurred,'项目需求描述':first.requirement,'公司名称':clean(first.raw.company_name),'来源渠道':clean(first.raw.platform),'首次表单时间':first.occurred};
    statements.push(db.prepare('INSERT OR IGNORE INTO crm_leads(id,name,phone,email,country,source,business_scope,channel,entered,detail,fingerprint,batch_id,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(lead.id,lead.name,lead.phone,lead.email,lead.country,'Meta',lead.business_scope,clean(first.raw.platform),first.occurred,JSON.stringify(detail),first.fingerprint,batchId,at));allocate.add(lead.id);
   }
   // Persist each source ID, including repeats, so re-fetches never create duplicate notes or notices.
   for(const r of fresh){
    const repeated=!isNew||r!==first,content=`表单${repeated?'再次询问':'首次询问'}｜提交时间：${r.occurred}\n需求：${r.requirement}`;
    statements.push(db.prepare('INSERT OR IGNORE INTO crm_form_submissions(id,lead_id,phone,email,occurred,raw,kind,created) VALUES(?,?,?,?,?,?,?,?)').bind(r.id,lead.id,r.phone,r.email,r.occurred,JSON.stringify(r.raw),repeated?'repeat':'new',at));
    statements.push(db.prepare("INSERT OR IGNORE INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES(?,?,?,?,?,'请查看本次需求并安排跟进',?)").bind('form-note:'+r.fingerprint,lead.id,actor,content,repeated?'再次询问':'表单咨询',at));
    if(repeated)result.repeated++;
    known.add(r.id);index(r,lead.id);
   }
   // Keep a complete customer group atomic; D1's batch is transactional.
   await commit(statements);
   result.groups.push({name:first.name,action:isNew?'新增客资':'追加询问',lead_id:lead.id,owner_id:lead.owner_id,count:fresh.length,earliest:first.occurred});
  }
  if(!options.preview){
   await flush();
   if(options.allocate!==false&&allocate.size){
    const {config,weights}=await allocationWeights(db);
    if(config.rule.automatic&&weights.length){const ids=[...allocate];for(let i=0;i<ids.length;i+=40){await db.batch([guard()]);result.autoAssigned+=await distribute(db,ids.slice(i,i+40),'all',actor);}}
    else result.allocationWarning='客资已去重入库，自动分配未开启或没有可接收人员';
   }
   const undelivered=(await db.prepare(`SELECT s.* FROM crm_form_submissions s JOIN crm_leads l ON l.id=s.lead_id JOIN crm_users u ON u.id=l.owner_id
    WHERE s.kind='repeat' AND u.active=1 AND NOT EXISTS(SELECT 1 FROM crm_lead_notifications n WHERE n.dedupe_key='form:'||s.id)`).all<any>()).results;
   for(const s of undelivered){const r=formRow(JSON.parse(s.raw)),submitted=new Intl.DateTimeFormat('zh-CN',{timeZone:'Australia/Sydney',dateStyle:'short',timeStyle:'short',hour12:false}).format(new Date(s.occurred));await commit([enquiryNotification(db,'form:'+s.id,s.lead_id,`客户再次提交了咨询，请跟进。\n提交时间（悉尼）：${submitted}\n需求：${r.requirement}`,at)]);}
   await flush();
  }
  return result;
 }finally{if(!options.preview)await db.prepare("DELETE FROM crm_form_import_lock WHERE id='meta' AND token=?").bind(token).run();}
}
