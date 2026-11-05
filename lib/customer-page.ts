import {contactMethod,contactMethodSQL} from './customer-contact-method';
import {customerContactCTE} from './customer-contact-method-server';
import {customerOwnerEligible,customerOwnerName} from './allocation-intake';
import {customerProfile} from './customer-profile';
import {customerLeadSQL,isColleague,importCustomerGrade} from './contact-kind';
import {customerInquiry} from './customer-inquiry';
import {customerMarket} from './operations-dashboard';
import {customerSource,customerSourceSQL,PLATFORM_PENDING} from './customer-source';
import {can} from './crm';
import {assignmentFields,assignmentJoin} from './assignment-reminders';
import {assignmentCategory} from './assignment-categories';
import {customerOrigin,sourceRecord} from './customer-origin';
import {dormantContactIds} from './contact-followup-server';

// Pagination is read-only. Keep the legacy /leads contract for existing consumers.
export async function customerPage(db:D1Database,user:any,url:URL,options:{unassignedOnly?:boolean;from?:string;to?:string;market?:string;platform?:string;account?:string}={}){
 const at=new Date().toISOString(),dormantOnly=url.searchParams.get('contact_mark')==='dormant';
 const p=url.searchParams,market=options.market||(['内贸','外贸','待确认'].includes(p.get('market')||'')?p.get('market')!:'');
 const account=options.account||(['乐园号','玩具号','工厂号','待确认'].includes(p.get('source_account')||'')?p.get('source_account')!:'');
 const all=can(user,'customers_all'),manages=all&&can(user,'leads_allocate');
 const poolAll=manages||options.unassignedOnly&&all;
 const pool=(await db.prepare('SELECT p.*,u.name AS creator_name,l.owner_id,o.name AS owner_name,l.status AS lead_status,l.grade AS lead_grade,l.last_contact FROM crm_customer_pool p JOIN crm_users u ON u.id=p.created_by LEFT JOIN crm_leads l ON l.id=COALESCE(p.lead_id,p.target_lead_id) LEFT JOIN crm_users o ON o.id=l.owner_id WHERE '+(poolAll?'1=1':user.role==='sales'?'(l.owner_id=? OR (p.created_by=? AND l.owner_id IS NULL))':'(p.created_by=? OR l.owner_id=?)')+(options.unassignedOnly?" AND p.state NOT IN ('已入CRM','放弃') AND COALESCE(l.owner_id,'')='' AND trim(COALESCE(l.original_owner,''))=''":'')+' ORDER BY p.created DESC,p.id').bind(...(poolAll?[]:[user.id,user.id])).all<any>()).results.filter(r=>!['已入CRM','放弃'].includes(r.state)&&!isColleague(r.lead_grade)).map(r=>({...r,payload:JSON.parse(r.payload)}));
 const sourceOwners=all&&pool.length?(await db.prepare("SELECT id,name,username,role,trade_scopes FROM crm_users WHERE active=1 AND role IN ('sales','management','ceo','followup')").all<any>()).results:[];
 const sourceOwner=(original:unknown,scope:string)=>{const key=customerOwnerName(original);if(!key)return undefined;const eligible=sourceOwners.filter(u=>customerOwnerEligible(u,scope)),exact=eligible.filter(u=>u.name.trim().toLowerCase()===key||u.username.trim().toLowerCase()===key),matches=exact.length?exact:/^[a-z]+$/.test(key)?eligible.filter(u=>u.name.trim().toLowerCase().split(/\s+/)[0]===key):[];return matches.length===1?matches[0]:undefined;};
 const dateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:options.unassignedOnly||options.from!==undefined||options.to!==undefined?'Asia/Shanghai':'Australia/Sydney'});
 const pending=pool.map(r=>{const raw=sourceRecord(r.raw),created=new Date(r.created),originalOwner=sourceOwner(r.payload.original_owner||raw['分配业务员']||'',r.payload.market||raw['客资市场']||'待确认');return {id:'intake:'+r.id,intake:r,name:r.payload.name||'暂无',phone:r.payload.phone||'',email:r.payload.email||'',country:r.payload.country||'',market:r.payload.market||r.payload['客资市场']||'待确认',source:r.source,display_source:customerSource({source:r.source,channel:r.payload.platform,detail:r.payload}),business_scope:r.payload.business_scope||'',entered:Number.isFinite(created.getTime())?dateFormat.format(created):'',detail:{'项目需求描述':r.payload.requirement||r.raw,'省份':r.payload.province||raw['省份']||'','城市':r.payload.city||raw['城市']||'','微信号':r.payload.wechat||raw['微信号']||'','偏好联系方式':r.payload.preferred_method||raw['偏好联系方式']||''},stage:r.state==='待确认'?'待核查':'待分配',status:'尚未进入跟进',grade:r.payload.grade??importCustomerGrade(raw['业务员跟进进度'],r.payload.market,true),owner_id:r.owner_id||originalOwner?.id,owner_name:r.owner_name||originalOwner?.name||r.payload.original_owner||raw['分配业务员']||'',owner_pending:!r.owner_id&&!!originalOwner};});
 for(const row of pending)Object.assign(row,{followup_method:contactMethod(row.detail['偏好联系方式'])},customerOrigin({...row,detail:{...row.intake.payload,...row.detail}},sourceRecord(row.intake.raw)));
 const hidden=pool.filter(r=>!r.target_lead_id).map(r=>r.lead_id||r.id),args:any[]=[...(all?[]:[user.id]),...(hidden.length?[JSON.stringify(hidden)]:[])];
 const base=`WITH ${customerContactCTE}, raw AS (SELECT l.*,contact.method AS actual_contact_method,${assignmentFields},u.name AS owner_name FROM crm_leads l LEFT JOIN ranked_contacts contact ON contact.lead_id=l.id AND contact.rank=1 LEFT JOIN crm_users u ON u.id=l.owner_id ${assignmentJoin} WHERE ${all?'1=1':'l.owner_id=?'}${hidden.length?' AND l.id NOT IN (SELECT value FROM json_each(?))':''}), classified AS (SELECT *,${contactMethodSQL("COALESCE(actual_contact_method,NULLIF(trim(json_extract(detail,'$.偏好联系方式')),''),NULLIF(trim(json_extract(detail,'$.联系方式偏好')),''),json_extract(detail,'$.which_method_would_you_prefer_to_be_contacted_by?'))")} AS followup_method,CASE WHEN assigned_at IS NULL OR assigned_at='' THEN 'unverified' WHEN assignment_policy IN ('historical-sheet-v1','historical-alignment','historical-sync') OR legacy_sync=1 THEN 'historical' ELSE 'new' END AS assignment_category FROM raw), rows AS (SELECT *,${customerSourceSQL()} AS display_source,CASE WHEN cohort='historical' AND assignment_category<>'new' AND status='待首次联系' THEN '已联系待回复' ELSE status END AS display_status,CASE WHEN cohort='historical' AND (owner_id IS NULL OR owner_id='') THEN '待归属对齐' WHEN cohort='unknown' THEN '日期待确认' WHEN review THEN '待核查' WHEN (owner_id IS NOT NULL AND owner_id<>'') OR original_owner<>'' THEN '已分配' ELSE '待分配' END AS stage FROM classified)`;
 const focusId=(p.get('lead_id')||'').slice(0,200);
 const conditions:string[]=isColleague(p.get('grade'))?[]:[customerLeadSQL('rows')],values:any[]=[],filters=['cohort','stage','business_scope','grade','source','status','owner_id'];
 const scopeMatches=(r:any)=>(!market||customerMarket(r)===market)&&(!options.platform||customerOrigin(r,r.original).display_source===options.platform)&&(!account||(r.origin_account||customerOrigin(r,r.original).origin_account)===account);
 if(market||options.platform||account){
  const candidates=(await db.prepare(base+" SELECT id,market,country,source,business_scope,channel,json_object('客资市场',json_extract(detail,'$.客资市场'),'接待抖音号',json_extract(detail,'$.接待抖音号'),'接待小红书号',json_extract(detail,'$.接待小红书号'),'来源账号',json_extract(detail,'$.来源账号'),'source_account',json_extract(detail,'$.source_account'),'来源平台',json_extract(detail,'$.来源平台'),'platform',json_extract(detail,'$.platform'),'form_name',json_extract(detail,'$.form_name'),'来源表单',json_extract(detail,'$.来源表单'),'_sheet',json_extract(detail,'$._sheet')) detail,(SELECT raw FROM crm_form_submissions f WHERE f.lead_id=rows.id AND f.kind='new' ORDER BY occurred,id LIMIT 1) original FROM rows").bind(...args).all<any>()).results;
  conditions.push('id IN (SELECT value FROM json_each(?))');values.push(JSON.stringify(candidates.filter(scopeMatches).map(r=>r.id)));
 }
 if(focusId){conditions.push('id=?');values.push(focusId);}
 const receivedDay="date(replace(entered,'/','-'),CASE WHEN instr(entered,'T')>0 THEN '+8 hours' ELSE '+0 hours' END)";
 if(options.unassignedOnly)conditions.push("COALESCE(owner_id,'')='' AND trim(original_owner)='' AND NOT EXISTS(SELECT 1 FROM crm_assignments simulation WHERE simulation.lead_id=rows.id AND simulation.policy='test-simulation') AND NOT EXISTS(SELECT 1 FROM crm_workflow_audit w,json_each(CASE WHEN json_valid(w.payload) THEN w.payload ELSE '{}' END,'$.assignments') event WHERE w.kind='撤销客资分配' AND w.entity_id=rows.id AND json_extract(event.value,'$.policy')='test-simulation')");
 if(options.from){conditions.push(receivedDay+'>=?');values.push(options.from);}
 if(options.to){conditions.push(receivedDay+'<=?');values.push(options.to);}
 for(const key of filters){const v=p.get(key);if(v!==null&&v!=='全部'){conditions.push((key==='source'&&['Facebook','Instagram',PLATFORM_PENDING,'WhatsApp'].includes(v)?'display_source':key==='status'?'display_status':key==='business_scope'||key==='grade'?`COALESCE(${key},'')`:key)+'=?');values.push(v);}}
 const region=(p.get('region')||'全部').slice(0,100),country=(p.get('country')||'全部').slice(0,100),method=contactMethod((p.get('method')||'全部').slice(0,100));
 if(country!=='全部'){conditions.push('instr(lower(country),lower(?))>0');values.push(country);}
 const provinceSQL="COALESCE(json_extract(detail,'$._customer_profile.province'),json_extract(detail,'$.省份'),'')",citySQL="COALESCE(json_extract(detail,'$._customer_profile.city'),json_extract(detail,'$.城市'),'')";
 if(region!=='全部'){conditions.push(`instr(lower(${market==='内贸'?provinceSQL:market==='外贸'?"country":"country || '/' || "+provinceSQL} || '/' || ${citySQL}),lower(?))>0`);values.push(region);}

 if(method!=='全部'){conditions.push('followup_method=?');values.push(method);}
 const q=(p.get('q')||'').slice(0,500).toLowerCase(),queue=p.get('queue')||'全部',today=p.get('today')||new Date().toLocaleDateString('sv-SE');
 if(q){
  // Preserve JavaScript Unicode case matching without loading every customer's detail blob.
  const candidates=(await db.prepare(base+" SELECT id,name,phone,email,country,COALESCE(json_extract(detail,'$._customer_profile.wechat'),json_extract(detail,'$.微信号')) wechat,json_extract(detail,'$.公司名称') company FROM rows").bind(...args).all<any>()).results;
  const ids=candidates.filter(r=>[r.name,r.phone,r.email,r.wechat,r.country,r.company].some(v=>v?.toLowerCase().includes(q))).map(r=>r.id);
  conditions.push('id IN (SELECT value FROM json_each(?))');values.push(JSON.stringify(ids));
 }
 if(['待分配','待核查'].includes(queue)){conditions.push('stage=?');values.push(queue);}
 if(queue==='待首次联系')conditions.push("(cohort='new' OR assignment_category='new') AND display_status='待首次联系'");
 if(queue==='今日跟进'){conditions.push('next_date=?');values.push(today);}
 if(queue==='逾期未跟进'){conditions.push("next_date<>'' AND next_date<? AND display_status NOT IN ('已成交','已结束')");values.push(today);}
 const matches=(r:any)=>(region==='全部'||[...(market==='内贸'?[]:[r.country]),customerProfile(r).province,customerProfile(r).city].join('/').toLowerCase().includes(region.toLowerCase()))&&(country==='全部'||r.country?.toLowerCase().includes(country.toLowerCase()))&&(method==='全部'||r.followup_method===method)&&filters.every(k=>p.get(k)===null||p.get(k)==='全部'||(k==='source'&&['Facebook','Instagram',PLATFORM_PENDING,'WhatsApp'].includes(p.get(k)||'')?(r.display_source||customerSource(r)):k==='grade'||k==='business_scope'?(r[k]||''):r[k])===p.get(k))&&(!q||[r.name,r.phone,r.email,customerProfile(r).wechat,r.country,r.detail?.['公司名称'],r.intake?.raw].some(v=>v?.toLowerCase().includes(q)))&&(queue==='全部'||queue==='待分配'&&r.stage==='待分配'||queue==='待核查'&&r.stage==='待核查'||queue==='待首次联系'&&(r.cohort==='new'||r.assignment_category==='new')&&r.status==='待首次联系'||queue==='今日跟进'&&r.next_date===today||queue==='逾期未跟进'&&r.next_date&&r.next_date<today&&!['已成交','已结束'].includes(r.status));
 const contactFields=`CASE WHEN EXISTS(SELECT 1 FROM crm_deals d WHERE d.lead_id=rows.id AND d.cancelled=0) THEN 'existing' ELSE 'new' END AS customer_type,(SELECT MAX(p.updated) FROM crm_customer_pool p WHERE p.lead_id=rows.id AND p.state='已入CRM' AND (rows.last_contact='' OR p.updated>rows.last_contact)) AS inquiry_at`;
 let dormantIds:Set<string>|undefined;
 if(dormantOnly){
  const candidates=(await db.prepare(base+` SELECT *,${contactFields} FROM rows`+(conditions.length?' WHERE '+conditions.join(' AND '):'')).bind(...args,...values).all<any>()).results;
  dormantIds=await dormantContactIds(db,candidates,at);conditions.push('id IN (SELECT value FROM json_each(?))');values.push(JSON.stringify([...dormantIds]));
 }
 const filteredPending=pending.filter(r=>(!focusId||r.id===focusId||r.intake.lead_id===focusId)&&!dormantOnly&&scopeMatches(r)&&matches(r)&&(!options.from||r.entered>=options.from)&&(!options.to||r.entered<=options.to)),where=conditions.length?' WHERE '+conditions.join(' AND '):'';
 const [count,groups]=await Promise.all([
  db.prepare(base+' SELECT COUNT(*) total FROM rows'+where).bind(...args,...values).first<{total:number}>(),
  db.prepare(base+" SELECT source,display_source,COALESCE(grade,'') grade,COUNT(*) total FROM rows WHERE COALESCE(grade,'') NOT IN ('Yifun Staff','同事') GROUP BY source,display_source,COALESCE(grade,'')").bind(...args).all<any>()
 ]);
 const total=(count?.total||0)+filteredPending.length,pages=Math.max(1,Math.ceil(total/30)),page=Math.max(1,Math.min(pages,Math.floor(Number(p.get('page'))||1))),offset=(page-1)*30,head=filteredPending.slice(offset,offset+30),take=30-head.length;
 const records=take?(await db.prepare(base+` SELECT *,${contactFields},(SELECT MAX(e.created) FROM crm_attribution_events e WHERE e.entity_id=rows.id AND e.kind='跟进状态变化') AS status_updated_at FROM rows${where} ORDER BY created DESC,id LIMIT ? OFFSET ?`).bind(...args,...values,take,Math.max(0,offset-filteredPending.length)).all<any>()).results:[];
 const marked=dormantIds||await dormantContactIds(db,records,at);
 const originals=records.length?(await db.prepare("SELECT lead_id,raw FROM crm_form_submissions WHERE lead_id IN (SELECT value FROM json_each(?)) AND kind='new' ORDER BY occurred,id").bind(JSON.stringify(records.map(r=>r.id))).all<any>()).results:[];
 const originalByLead=new Map<string,any>();for(const row of originals)if(!originalByLead.has(row.lead_id))originalByLead.set(row.lead_id,row.raw);
 const sources:Record<string,number>={},platform_sources:Record<string,number>={},grades:Record<string,number>={};let overall=pending.length;
 for(const g of groups.results){platform_sources[g.display_source]=(platform_sources[g.display_source]||0)+g.total;sources[g.source]=(sources[g.source]||0)+g.total;grades[g.grade]=(grades[g.grade]||0)+g.total;overall+=g.total;}
 for(const r of pending){const label=r.display_source||customerSource(r);platform_sources[label]=(platform_sources[label]||0)+1;sources[r.source]=(sources[r.source]||0)+1;grades[r.grade||'']=(grades[r.grade||'']||0)+1;}
 return {rows:[...head.map(r=>({...r,original_inquiry:customerInquiry(r)})),...records.map(r=>({...r,...customerOrigin(r,originalByLead.get(r.id)),original_inquiry:customerInquiry(r,originalByLead.get(r.id)),name:r.name||'暂无',stored_status:r.status,status:r.display_status,dormant:marked.has(r.id),assignment_category:assignmentCategory(r),detail:JSON.parse(r.detail)}))],total,page,pages,overall,sources,platform_sources,grades};
}
