import {customerSource,customerSourceSQL,PLATFORM_PENDING} from './customer-source';
import {can} from './crm';
import {assignmentFields,assignmentJoin} from './assignment-reminders';
import {assignmentCategory} from './assignment-categories';

// Pagination is read-only. Keep the legacy /leads contract for existing consumers.
export async function customerPage(db:D1Database,user:any,url:URL){
 const p=url.searchParams,all=can(user,'customers_all'),manages=all&&can(user,'leads_allocate');
 const pool=(await db.prepare('SELECT p.*,u.name AS creator_name,l.owner_id,o.name AS owner_name,l.status AS lead_status,l.last_contact FROM crm_customer_pool p JOIN crm_users u ON u.id=p.created_by LEFT JOIN crm_leads l ON l.id=COALESCE(p.lead_id,p.target_lead_id) LEFT JOIN crm_users o ON o.id=l.owner_id'+(manages?'':user.role==='sales'?' WHERE l.owner_id=? OR (p.created_by=? AND l.owner_id IS NULL)':' WHERE p.created_by=? OR l.owner_id=?')+' ORDER BY p.created DESC,p.id LIMIT 300').bind(...(manages?[]:[user.id,user.id])).all<any>()).results.filter(r=>r.state!=='已入CRM').map(r=>({...r,payload:JSON.parse(r.payload)}));
 const pending=pool.map(r=>({id:'intake:'+r.id,intake:r,name:r.payload.name||'待整理咨询',phone:r.payload.phone||'',email:r.payload.email||'',country:r.payload.country||'',source:r.source,display_source:customerSource({source:r.source,channel:r.payload.platform,detail:r.payload}),business_scope:r.payload.business_scope||'',entered:new Date(r.created).toLocaleDateString('sv-SE',{timeZone:'Australia/Sydney'}),detail:{'项目需求描述':r.payload.requirement||r.raw},stage:r.state==='待确认'?'待核查':'待分配',status:'尚未进入跟进',grade:'',owner_id:r.owner_id,owner_name:r.owner_name}));
 const hidden=pool.filter(r=>!r.target_lead_id).map(r=>r.lead_id||r.id),args:any[]=[...(all?[]:[user.id]),...(hidden.length?[JSON.stringify(hidden)]:[])];
 const base=`WITH raw AS (SELECT l.*,${assignmentFields},u.name AS owner_name FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id ${assignmentJoin} WHERE ${all?'1=1':'l.owner_id=?'}${hidden.length?' AND l.id NOT IN (SELECT value FROM json_each(?))':''}), classified AS (SELECT *,CASE WHEN assigned_at IS NULL OR assigned_at='' THEN 'unverified' WHEN assignment_policy IN ('historical-sheet-v1','historical-alignment','historical-sync') OR legacy_sync=1 THEN 'historical' ELSE 'new' END AS assignment_category FROM raw), rows AS (SELECT *,${customerSourceSQL()} AS display_source,CASE WHEN cohort='historical' AND assignment_category<>'new' AND status='待首次联系' THEN '已联系待回复' ELSE status END AS display_status,CASE WHEN cohort='historical' AND (owner_id IS NULL OR owner_id='') THEN '待归属对齐' WHEN cohort='unknown' THEN '日期待确认' WHEN review THEN '待核查' WHEN (owner_id IS NOT NULL AND owner_id<>'') OR original_owner<>'' THEN '已分配' ELSE '待分配' END AS stage FROM classified)`;
 const conditions:string[]=[],values:any[]=[],filters=['cohort','stage','business_scope','grade','source','status','owner_id'];
 for(const key of filters){const v=p.get(key);if(v!==null&&v!=='全部'){conditions.push((key==='source'&&['Facebook','Instagram',PLATFORM_PENDING].includes(v)?'display_source':key==='status'?'display_status':key==='business_scope'||key==='grade'?`COALESCE(${key},'')`:key)+'=?');values.push(v);}}
 const country=(p.get('country')||'全部').slice(0,100),method=(p.get('method')||'全部').slice(0,100);
 if(country!=='全部'){conditions.push('instr(lower(country),lower(?))>0');values.push(country);}
 if(method!=='全部'){conditions.push("instr(lower(COALESCE(json_extract(detail,'$.偏好联系方式'),json_extract(detail,'$.联系方式偏好'),json_extract(detail,'$.which_method_would_you_prefer_to_be_contacted_by?'),'')),lower(?))>0");values.push(method);}
 const q=(p.get('q')||'').slice(0,500).toLowerCase(),queue=p.get('queue')||'全部',today=p.get('today')||new Date().toLocaleDateString('sv-SE');
 if(q){
  // Preserve JavaScript Unicode case matching without loading every customer's detail blob.
  const candidates=(await db.prepare(base+" SELECT id,name,phone,email,country,json_extract(detail,'$.公司名称') company FROM rows").bind(...args).all<any>()).results;
  const ids=candidates.filter(r=>[r.name,r.phone,r.email,r.country,r.company].some(v=>v?.toLowerCase().includes(q))).map(r=>r.id);
  conditions.push('id IN (SELECT value FROM json_each(?))');values.push(JSON.stringify(ids));
 }
 if(['待分配','待核查'].includes(queue)){conditions.push('stage=?');values.push(queue);}
 if(queue==='待首次联系')conditions.push("(cohort='new' OR assignment_category='new') AND display_status='待首次联系'");
 if(queue==='今日跟进'){conditions.push('next_date=?');values.push(today);}
 if(queue==='逾期未跟进'){conditions.push("next_date<>'' AND next_date<? AND display_status NOT IN ('已成交','已结束')");values.push(today);}
 const matches=(r:any)=>(country==='全部'||r.country?.toLowerCase().includes(country.toLowerCase()))&&(method==='全部'||String(r.detail?.['偏好联系方式']||r.detail?.['联系方式偏好']||r.detail?.['which_method_would_you_prefer_to_be_contacted_by?']||'').toLowerCase().includes(method.toLowerCase()))&&filters.every(k=>p.get(k)===null||p.get(k)==='全部'||(k==='source'&&['Facebook','Instagram',PLATFORM_PENDING].includes(p.get(k)||'')?(r.display_source||customerSource(r)):k==='grade'||k==='business_scope'?(r[k]||''):r[k])===p.get(k))&&(!q||[r.name,r.phone,r.email,r.country,r.detail?.['公司名称'],r.intake?.raw].some(v=>v?.toLowerCase().includes(q)))&&(queue==='全部'||queue==='待分配'&&r.stage==='待分配'||queue==='待核查'&&r.stage==='待核查'||queue==='待首次联系'&&(r.cohort==='new'||r.assignment_category==='new')&&r.status==='待首次联系'||queue==='今日跟进'&&r.next_date===today||queue==='逾期未跟进'&&r.next_date&&r.next_date<today&&!['已成交','已结束'].includes(r.status));
 const filteredPending=pending.filter(matches),where=conditions.length?' WHERE '+conditions.join(' AND '):'';
 const [count,groups]=await Promise.all([
  db.prepare(base+' SELECT COUNT(*) total FROM rows'+where).bind(...args,...values).first<{total:number}>(),
  db.prepare(base+" SELECT source,display_source,COALESCE(grade,'') grade,COUNT(*) total FROM rows GROUP BY source,display_source,COALESCE(grade,'')").bind(...args).all<any>()
 ]);
 const total=(count?.total||0)+filteredPending.length,pages=Math.max(1,Math.ceil(total/30)),page=Math.max(1,Math.min(pages,Math.floor(Number(p.get('page'))||1))),offset=(page-1)*30,head=filteredPending.slice(offset,offset+30),take=30-head.length;
 const records=take?(await db.prepare(base+` SELECT *,CASE WHEN EXISTS(SELECT 1 FROM crm_deals d WHERE d.lead_id=rows.id AND d.cancelled=0) THEN 'existing' ELSE 'new' END AS customer_type FROM rows${where} ORDER BY created DESC,id LIMIT ? OFFSET ?`).bind(...args,...values,take,Math.max(0,offset-filteredPending.length)).all<any>()).results:[];
 const sources:Record<string,number>={},platform_sources:Record<string,number>={},grades:Record<string,number>={};let overall=pending.length;
 for(const g of groups.results){platform_sources[g.display_source]=(platform_sources[g.display_source]||0)+g.total;sources[g.source]=(sources[g.source]||0)+g.total;grades[g.grade]=(grades[g.grade]||0)+g.total;overall+=g.total;}
 for(const r of pending){const label=r.display_source||customerSource(r);platform_sources[label]=(platform_sources[label]||0)+1;sources[r.source]=(sources[r.source]||0)+1;grades['']=(grades['']||0)+1;}
 return {rows:[...head,...records.map(r=>({...r,status:r.display_status,assignment_category:assignmentCategory(r),detail:JSON.parse(r.detail)}))],total,page,pages,overall,sources,platform_sources,grades};
}
