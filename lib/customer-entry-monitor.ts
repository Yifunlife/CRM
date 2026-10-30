import {BUSINESS_SCOPES} from './allocation';
import {can,emailKey,phoneKey,now} from './crm';
import {AllocationError} from './allocation-server';
import {reportAcquiredDay} from './report-acquired-day';
import {customerSource,PLATFORM_PENDING} from './customer-source';

export const CUSTOMER_ENTRY_RULES=[
 {number:1,name:'历史／新增客资分类',description:'按北京时间原始进入日期，以2026年11月1日为分界；日期不明或分类不符时待核对。'},
 {number:2,name:'历史归属未对齐或冲突',description:'历史归属缺失、原负责人与现有归属不一致，或历史记录仍有待核查标记。'},
 {number:3,name:'新增客资尚未分配',description:'已明确为新增、无负责人和原归属，且没有待核查或疑似重复问题的客资。'},
 {number:4,name:'负责人异常',description:'已有负责人关联失效、账号停用，或账号角色不再符合现有客户归属要求。'},
 {number:5,name:'疑似重复客户',description:'联系方式或规范化公司名称相同，且尚未确认同一客户或确认不同客户。仅提示人工核查。'},
 {number:6,name:'来源信息缺失',description:'来源、必要平台信息、业务范围、原始进入日期，或已声明广告来源的活动关联缺失。'}
] as const;
export type EntryFinding={id:string;rule_number:number;stage:string;level:'待确认'|'待处理'|'历史对齐'|'异常';title:string;evidence:string;suggestion:string;owner_id:string;owner_name:string;lead_id?:string;page:string;count:number};
const list=async(db:D1Database,q:string,args:any[]=[]) =>(await db.prepare(q).bind(...args).all<any>()).results;
const parse=(raw:string)=>{try{const value=JSON.parse(raw||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}};
const companyKey=(v:any)=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const pairKey=(a:string,b:string)=>JSON.stringify([a,b].sort());

export async function customerEntryMonitor(db:D1Database,user:any,options?:{rule:number;page:number}){
 if(options&&(!Number.isInteger(options.rule)||options.rule<1||options.rule>6||!Number.isInteger(options.page)||options.page<1))throw new AllocationError('请选择有效规则和页码',400);
 const all=can(user,'customers_all'),args=all?[]:[user.id],where=all?'1=1':'l.owner_id=?';
 const [leads,pool,reviews,accounts]=await Promise.all([
  list(db,`SELECT l.id,l.name,l.phone,l.email,l.source,l.channel,l.business_scope,l.entered,l.created,l.cohort,l.owner_id,l.original_owner,l.review,u.id AS existing_owner,u.name AS owner_name,u.active AS owner_active,u.role AS owner_role,s.subject_id,
   json_object('公司名称',json_extract(CASE WHEN json_valid(l.detail) THEN l.detail ELSE '{}' END,'$.公司名称'),'platform',json_extract(CASE WHEN json_valid(l.detail) THEN l.detail ELSE '{}' END,'$.platform'),'来源渠道',json_extract(CASE WHEN json_valid(l.detail) THEN l.detail ELSE '{}' END,'$.来源渠道'),'来源平台',json_extract(CASE WHEN json_valid(l.detail) THEN l.detail ELSE '{}' END,'$.来源平台')) AS detail,
   a.source_kind,a.campaign_id,c.id AS existing_campaign
   FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id LEFT JOIN crm_customer_subject_links s ON s.lead_id=l.id LEFT JOIN crm_attribution_leads a ON a.lead_id=l.id LEFT JOIN crm_attribution_campaigns c ON c.id=a.campaign_id WHERE `+where+' ORDER BY l.id',args),
  list(db,"SELECT p.id,p.source,p.payload,p.raw,p.created,p.created_by,p.state,p.last_error FROM crm_customer_pool p LEFT JOIN crm_leads l ON l.id=COALESCE(p.lead_id,p.target_lead_id) WHERE p.state<>'已入CRM' AND l.id IS NULL"+(all?'':' AND p.created_by=?')+' ORDER BY p.id',args),
  list(db,"SELECT r.id,r.lead_id,r.other_lead_id,r.state,r.updated FROM crm_customer_identity_reviews r JOIN crm_leads l ON l.id=r.lead_id JOIN crm_leads other ON other.id=r.other_lead_id WHERE r.other_lead_id IS NOT NULL AND "+where+(all?'':' AND other.owner_id=?')+' ORDER BY r.updated,r.rowid',all?[]:[user.id,user.id]),
  list(db,"SELECT id,name FROM crm_users WHERE active=1 AND role IN ('sales','ceo','management')")
 ]);
 const records=leads.map(l=>({...l,detail:parse(l.detail),intake:false}));
 for(const p of pool){
  const payload=parse(p.payload),raw=parse(p.raw);
  const entered=payload.entered||payload.occurred||raw.created_time||raw.录入日期||'';
  const day=reportAcquiredDay(String(entered));
  records.push({...payload,id:'pool:'+p.id,name:payload.name||'待入档咨询',source:p.source,phone:payload.phone||'',email:payload.email||'',entered,created:p.created,cohort:day?(day<'2026-11-01'?'historical':'new'):'unknown',owner_id:null,original_owner:'',review:p.state==='待确认'?1:0,detail:payload,state:p.state,last_error:p.last_error,intake:true});
 }
 const decisions=new Map<string,string>();for(const r of reviews)decisions.set(pairKey(r.lead_id,r.other_lead_id),r.state);
 const buckets=new Map<string,any[]>();
 for(const l of records){
  const phone=phoneKey(l.phone),email=emailKey(l.email),company=companyKey(l.detail?.公司名称);
  for(const key of [phone.length>=7?'phone:'+phone:'',email&&email.includes('@')?'email:'+email:'',company.length>=3?'company:'+company:''].filter(Boolean)){
   const rows=buckets.get(key)||[];rows.push(l);buckets.set(key,rows);
  }
 }
 const duplicate=new Map<string,Set<string>>();
 for(const [key,group] of buckets){
  if(group.length<2||group.every(l=>l.subject_id&&l.subject_id===group[0].subject_id))continue;
  for(const l of group){
   const other=group.find(o=>o.id!==l.id&&!(l.subject_id&&l.subject_id===o.subject_id)&&!['确认同一客户','确认不同客户'].includes(decisions.get(pairKey(l.id,o.id))||''));
   if(!other)continue;
   const reasons=duplicate.get(l.id)||new Set<string>();
   reasons.add((key.startsWith('phone:')?'联系电话相同':key.startsWith('email:')?'邮箱相同':'公司名称规范化后相同')+'：'+other.name+'（'+other.id+'）');duplicate.set(l.id,reasons);
  }
 }
 const hits=new Map<number,EntryFinding[]>(CUSTOMER_ENTRY_RULES.map(r=>[r.number,[]]));
 const add=(number:number,l:any,reasons:string[],suggestion:string,level:EntryFinding['level']='待确认')=>{
  if(!reasons.length)return;
  hits.get(number)!.push({id:'customer-rule:'+number+':'+l.id,rule_number:number,stage:'客户',level,title:l.name,evidence:reasons.join('；'),suggestion,owner_id:l.owner_id||'',owner_name:l.owner_name||'管理者待核查',...(!l.intake?{lead_id:l.id}:{}),page:all?'工作台':'我的客资',count:1});
 };
 for(const l of records){
  const day=reportAcquiredDay(String(l.entered||'')),dateIssues:string[]=[];
  if(!day)dateIssues.push('原始进入日期缺失或无法确认，不能据此认定新增');
  else if(l.cohort!==(day<'2026-11-01'?'historical':'new'))dateIssues.push('原始进入日期为北京时间'+day+'，与现有历史／新增分类不一致');
  if(l.cohort==='unknown')dateIssues.push('现有分类为日期待确认');
  add(1,l,dateIssues,'核查原始资料及北京时间日期；保留现有记录，确认后由有权限人员处理。');
  if(l.cohort==='historical'){
   const issues:string[]=[];
   if(!l.owner_id)issues.push('历史客资尚未关联原负责人');
   if(l.original_owner){const matches=accounts.filter(a=>a.name.trim()===l.original_owner.trim());if(!matches.length)issues.push('原负责人尚未匹配到有效业务账号');else if(matches.length>1)issues.push('原负责人名称对应多个有效账号，需人工确认具体人员');}
   if(l.original_owner&&l.owner_name&&l.original_owner.trim()!==l.owner_name.trim())issues.push('原负责人为'+l.original_owner+'，现有负责人为'+l.owner_name+'，需核对是否有正式转交依据');
   if(l.review)issues.push('历史记录存在待核查标记');
   add(2,l,issues,'管理员从旧数据库核对原归属及转交依据；历史对齐不计新增分配或首次联系逾期。','历史对齐');
  }
  if(l.cohort==='new'&&day&&day>='2026-11-01'&&BUSINESS_SCOPES.some(s=>s.id===l.business_scope)&&!l.owner_id&&!l.original_owner&&!l.review&&!duplicate.has(l.id)&&(!l.intake||l.state==='待分配'))
   add(3,l,['原始日期明确为新增，尚无负责人、原归属和已发现的重复／待核查问题',...(l.last_error?['此前处理未完成：'+l.last_error]:[])],'在客户管理确认分配，系统按现有共同队列规则均分；监控本身不执行分配。','待处理');
  if(l.owner_id){
   const issues:string[]=[];
   if(!l.existing_owner)issues.push('负责人编号未找到对应账号');
   else if(!l.owner_active)issues.push('负责人账号已停用');
   else if(!['sales','ceo','management'].includes(l.owner_role))issues.push('当前负责人角色不属于现有客户归属核查支持的业务角色，需确认');
   add(4,l,issues,'管理员核对有效负责人和历史交接记录；不自动重新分配。','异常');
  }
  if(duplicate.has(l.id))add(5,l,[...duplicate.get(l.id)!],'人工核查对应记录；在原客户核查流程确认同一客户或不同客户，不自动合并。');
  const missing:string[]=[];
  if(!l.source?.trim()||['未知来源','来源待确认'].includes(l.source.trim()))missing.push('客资来源未明确');
  if(customerSource(l)===PLATFORM_PENDING)missing.push('Meta具体平台尚未明确或Facebook／Instagram证据冲突');
  if(!day)missing.push('缺少可确认的原始进入时间');
  if(!BUSINESS_SCOPES.some(s=>s.id===l.business_scope))missing.push('来源业务范围未明确，无法按现有分配队列处理');
  if(l.source_kind==='广告活动'&&(!l.campaign_id||!l.existing_campaign))missing.push('已标记广告活动，但活动关联缺失或失效');
  add(6,l,missing,'核对原始来源、平台、进入时间和已有广告关联，只按证据补充，不猜测来源。');
 }
 const rules=CUSTOMER_ENTRY_RULES.map(r=>({...r,count:hits.get(r.number)!.length}));
 const selectedRule=options?.rule||null,rows=selectedRule?hits.get(selectedRule):[];
 if(selectedRule&&!rows)throw new AllocationError('请选择第1至6项客户监控规则',400);
 const total=rows?.length||0,pages=Math.max(1,Math.ceil(total/20)),page=Math.min(Math.max(1,options?.page||1),pages);
 return {at:now(),scope:all?'全团队':'本人',rules,classification:{historical:records.filter(l=>l.cohort==='historical').length,new:records.filter(l=>l.cohort==='new').length,unknown:records.filter(l=>l.cohort==='unknown').length},selectedRule,total,page,pages,rows:rows?.slice((page-1)*20,page*20)||[],note:'同一记录可命中多项规则；数量按各项涉及的记录分别统计，不相加为新增客资。'};
}
