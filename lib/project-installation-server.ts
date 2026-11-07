import {AllocationError} from './allocation-server';
import {authorizedLead,can,id,now} from './crm';
import {boardLeadVisible} from './market-access';
import {blankInstallation,installationReady,INSTALLATION_PROFILE_FIELDS,INSTALLATION_FACTORY_FIELDS,INSTALLATION_CLIENT_FIELDS,INSTALLATION_TRAVEL_FIELDS,INSTALLATION_ACCEPTANCE_FIELDS,type InstallationPlan,type InstallationArrivalBatch} from './project-installation';
const kind='安装安排更新';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
const text=(value:any,max=2000)=>typeof value==='string'&&value.trim().length<=max?value.trim():fail('填写内容无效或过长');
const date=(value:string)=>!value||/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:fail('请填写有效日期');
const list=async(db:D1Database,sql:string,args:any[]=[])=> (await db.prepare(sql).bind(...args).all<any>()).results;
function factoryEditor(u:any,actor:any){return u.id===actor.id&&['admin','ceo','management'].includes(u.role)&&['admin','ceo','management'].includes(actor.role)&&!u.personal_business;}
async function entity(db:D1Database,u:any,key:string){
 if(!/^(sales|order):[^:]+$/.test(key)||key.length>150)fail('项目编号无效');
 const [type,keyId]=key.split(':');
 const source:any=await db.prepare(type==='order'?'SELECT * FROM crm_followup_orders WHERE id=?':'SELECT * FROM crm_sales_projects WHERE project_id=?').bind(keyId).first();
 if(!source)fail('项目不存在或无权查看',404);
 const lead:any=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(source.lead_id).first();
 if(!lead||!authorizedLead(u,lead)||!boardLeadVisible(u,lead))fail('项目不存在或无权查看',404);
 const details=JSON.parse(source.details||'{}'),dealId=type==='order'?source.deal_id:details.deal_id;
 const order=type==='order'?source:dealId?await db.prepare('SELECT * FROM crm_followup_orders WHERE deal_id=? AND lead_id=?').bind(dealId,lead.id).first<any>():null;
 if(u.role==='sales'&&order&&order.commercial_id!==u.id)fail('项目不存在或无权查看',404);
 const projects=dealId?await list(db,"SELECT project_id FROM crm_sales_projects WHERE lead_id=? AND json_extract(details,'$.deal_id')=?",[lead.id,dealId]):[];
 const aliases=[...new Set([...(order?['order:'+order.id]:[]),key,...projects.map(p=>'sales:'+p.project_id)])];
 return {source,lead,order,aliases,key:order?'order:'+order.id:key,archived:!!order?.archived||!!source.archived,projectId:type==='sales'?keyId:projects[0]?.project_id||null};
}
async function records(db:D1Database,aliases:string[]){return list(db,`SELECT e.id AS revision,e.payload,e.created,u.name AS author FROM crm_sales_events e LEFT JOIN crm_users u ON u.id=e.created_by WHERE e.kind=? AND json_extract(e.payload,'$.entity') IN (${aliases.map(()=>'?').join(',')}) ORDER BY e.rowid DESC LIMIT 20`,[kind,...aliases]);}
async function confirmations(db:D1Database,aliases:string[],plan:InstallationPlan){
 const stages:[string,boolean,string[]][]=[['factory',plan.factory.confirmed,['确认工厂人员并交接商务']],['client',plan.client.confirmed,['确认客户及出行准备']],['travel',!!plan.travel.issued&&!plan.travel.reconfirmation,['更新出票及行程确认','登记出票及最终行程']],['acceptance',!!plan.acceptance.installed||!!plan.acceptance.accepted,['更新安装与客户验收']]];
 const entries=await Promise.all(stages.filter(([,active])=>active).map(async([section,,actions])=>{
  const record=await db.prepare(`SELECT u.name AS author,e.created,json_extract(e.payload,'$.action') AS action FROM crm_sales_events e LEFT JOIN crm_users u ON u.id=e.created_by WHERE e.kind=? AND json_extract(e.payload,'$.entity') IN (${aliases.map(()=>'?').join(',')}) AND json_extract(e.payload,'$.action') IN (${actions.map(()=>'?').join(',')}) ORDER BY e.rowid DESC LIMIT 1`).bind(kind,...aliases,...actions).first();
  return [section,record] as const;
 }));
 return Object.fromEntries(entries.filter(([,record])=>record));
}
export async function projectInstallationEndpoint(db:D1Database,u:any,actor:any,path:string,method:string,body:any,url:URL):Promise<any>{
 if(!['project-installation/plans','project-installation/plan','project-installation/dossier'].includes(path))return undefined;
 if(!['sales','admin','ceo','management'].includes(u.role)||u.role!=='sales'&&!can(u,'customers_all'))fail('没有项目安装计划查看权限',403);
 if(path==='project-installation/dossier'){
  if(method!=='GET')fail('请求方式无效',405);
  const leadId=url.searchParams.get('lead')||'',lead:any=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(leadId).first();
  if(!lead||!authorizedLead(u,lead)||!boardLeadVisible(u,lead))fail('客户不存在或无权查看',404);
  const sources=await list(db,"SELECT 'sales:'||project_id AS entity,name FROM crm_sales_projects WHERE lead_id=? UNION ALL SELECT 'order:'||id AS entity,project AS name FROM crm_followup_orders WHERE lead_id=?",[leadId,leadId]);
  const seen=new Set<string>(),items=[];
  for(const source of sources){
   let detail;try{detail=await projectInstallationEndpoint(db,u,actor,'project-installation/plan','GET',{},new URL('https://crm.invalid/?entity='+encodeURIComponent(source.entity)));}catch(error){if(error instanceof AllocationError&&error.status===404)continue;throw error;}
   if(!seen.has(detail.entity)){seen.add(detail.entity);items.push({...detail,name:source.name});}
  }
  return {items};
 }
 if(path==='project-installation/plans'){
  if(method!=='GET')fail('请求方式无效',405);
  const all=u.role!=='sales'&&can(u,'customers_all');
  const rows=await list(db,`SELECT e.id AS revision,e.payload,e.created,COALESCE(o.project,p.name) AS project_name,CASE WHEN o.id IS NOT NULL THEN 'order:'||o.id ELSE json_extract(e.payload,'$.entity') END AS canonical_entity,l.id AS lead_id,l.owner_id,l.grade,l.market,l.country,l.source,l.business_scope,l.detail FROM crm_sales_events e JOIN crm_leads l ON l.id=e.lead_id LEFT JOIN crm_sales_projects p ON json_extract(e.payload,'$.entity')='sales:'||p.project_id LEFT JOIN crm_followup_orders o ON json_extract(e.payload,'$.entity')='order:'||o.id OR p.lead_id=o.lead_id AND json_extract(p.details,'$.deal_id')=o.deal_id WHERE e.kind=? AND (p.project_id IS NOT NULL OR o.id IS NOT NULL) AND ${all?'1=1':'l.owner_id=? AND (o.id IS NULL OR o.commercial_id=?)'} AND NOT EXISTS(SELECT 1 FROM crm_sales_events n WHERE n.kind=e.kind AND json_extract(n.payload,'$.entity')=json_extract(e.payload,'$.entity') AND n.rowid>e.rowid) ORDER BY e.rowid DESC`,[kind,...(all?[]:[u.id,u.id])]);
  const seen=new Set<string>();return {items:rows.filter(r=>{if(!boardLeadVisible(u,r)||seen.has(r.canonical_entity))return false;seen.add(r.canonical_entity);return true;}).map(r=>({revision:r.revision,created:r.created,name:r.project_name,...JSON.parse(r.payload),entity:r.canonical_entity}))};
 }
 if(method!=='GET'&&method!=='POST')fail('请求方式无效',405);
 if(method==='POST'&&(!body||typeof body!=='object'||Array.isArray(body)))fail('请求格式无效');
 const p=await entity(db,u,method==='GET'?url.searchParams.get('entity')||'':text(body.entity,150)),history=await records(db,p.aliases),current=history[0];
 const previous:InstallationPlan=current?JSON.parse(current.payload).plan:blankInstallation();
 const canFactory=factoryEditor(u,actor),canCommercial=u.id===actor.id&&(canFactory||u.role==='sales'&&can(u,'customers_edit'));
 if(method==='GET')return {entity:p.key,revision:current?.revision||'',plan:previous,can_factory:canFactory&&!p.archived,can_commercial:canCommercial&&!p.archived,confirmations:await confirmations(db,p.aliases,previous),history:history.map(r=>({id:r.revision,created:r.created,author:r.author,action:JSON.parse(r.payload).action,plan:JSON.parse(r.payload).plan})),archived:p.archived};
 if(p.archived)fail('项目订单已归档，不能修改安装安排',409);
 const action=text(body.action,50),section=['profile','remarks'].includes(action)?'profile':['factory-draft','factory-confirm'].includes(action)?'factory':['client-save','client-confirm'].includes(action)?'client':action==='travel-confirm'?'travel':action==='acceptance-save'?'acceptance':'';
 if(!section)return fail('安装安排操作无效');
 if(Object.hasOwn(body,'arrivals')&&section!=='client')fail('到货批次请在到货与签证环节维护');
 if(!(section==='profile'||section==='factory'?canFactory:canCommercial))fail(section==='profile'||section==='factory'?'工厂人员与排期仅限销售管理层及以上维护':'仅本项目商务或管理人员可维护此项',403);
 if(text(body.revision||'',100)!==(current?.revision||''))fail('安装安排已被其他人更新，请刷新后重新填写',409);
 if(!body.values||typeof body.values!=='object'||Array.isArray(body.values))fail('安装安排资料格式无效');
 if(action==='remarks'&&!Object.hasOwn(body.values,'remarks'))fail('请填写备注，清空备注可留空');
 const definitions={profile:INSTALLATION_PROFILE_FIELDS,factory:INSTALLATION_FACTORY_FIELDS,client:INSTALLATION_CLIENT_FIELDS,travel:INSTALLATION_TRAVEL_FIELDS,acceptance:INSTALLATION_ACCEPTANCE_FIELDS};
 const values:Record<string,any>={};
 for(const [key] of definitions[section]){const value=text(body.values[key]??(section==='factory'&&['company_people','external_technicians','external_people'].includes(key)?previous.factory[key]||'':''),key==='notes'||key==='remarks'||key==='evidence'?5000:500);values[key]=key.endsWith('_date')||['planned_arrival','customer_start','customer_end','actual_arrival','actual_departure','actual_end'].includes(key)?date(value):value;}
 for(const key of section==='client'?['site_ready','documents_ready','cost_confirmed']:section==='acceptance'?['installed','accepted']:[]){if(typeof body.values[key]!=='boolean')fail('请完整确认本环节核对项');values[key]=body.values[key];}
 const plan=structuredClone(previous);
 const requireFields=(keys:string[])=>{for(const key of keys)if(!values[key])fail('请完整填写本环节资料与确认依据');};
 if(action==='remarks')plan.profile={...previous.profile,remarks:values.remarks};
 else if(section==='profile'){
  if(values.area_m2&&(!Number.isFinite(Number(values.area_m2))||Number(values.area_m2)<=0))fail('面积需为大于零的数值');
  if(values.labyrinth&&!['是','否','待确认'].includes(values.labyrinth))fail('请选择是否有迷宫');
  if(values.customer_start&&values.customer_end&&values.customer_start>values.customer_end)fail('安装结束日期不能早于开始日期');
  const changed=['planned_arrival','planned_arrival_note','customer_start','customer_end','site_contact'].some(k=>values[k]!==previous.profile[k]);plan.profile=values;
  if(changed&&previous.client.confirmed){plan.client.confirmed=false;plan.travel.reconfirmation=previous.travel.issued;plan.acceptance.installed=false;plan.acceptance.accepted=false;}
 }
 if(section==='factory'){
  for(const key of ['people','days'])if(values[key]&&(!/^\d+$/.test(values[key])||Number(values[key])<1||Number(values[key])>1000))fail('安装人数和天数需为有效正整数');
  for(const key of ['company_people','external_people'])if(values[key]&&(!/^\d+$/.test(values[key])||Number(values[key])>1000))fail('公司师傅和外请人数需为 0 至 1000 的整数');
  if(values.people&&values.company_people!==''&&values.external_people!==''&&Number(values.company_people)+Number(values.external_people)!==Number(values.people))fail('公司师傅人数加外请人数需等于安装总人数');
  if(values.transfer_days&&(!/^\d+$/.test(values.transfer_days)||Number(values.transfer_days)>365))fail('转场天数需为 0 至 365 的整数');
  if(values.departure_date&&values.available_date&&values.departure_date<values.available_date||values.end_date&&values.departure_date&&values.end_date<values.departure_date)fail('请核对工厂可出发、安装出发与结束日期');
  if(action==='factory-confirm')requireFields(['factory','technicians','people','project_lead','days','available_date','departure_date','end_date','internal_owner','evidence']);
  const changed=INSTALLATION_FACTORY_FIELDS.some(([k])=>k!=='due_date'&&values[k]!==previous.factory[k]);
  plan.factory={...values,confirmed:action==='factory-confirm'} as InstallationPlan['factory'];
  if(changed||!plan.factory.confirmed){plan.client.confirmed=false;plan.travel.reconfirmation=previous.travel.issued;plan.acceptance.installed=false;plan.acceptance.accepted=false;}
 }
 if(section==='client'){
  if(Object.hasOwn(body,'arrivals')){
   if(!Array.isArray(body.arrivals)||body.arrivals.length>50)fail('请登记有效到货批次，最多50批');
   const ids=new Set<string>();
   plan.arrivals=body.arrivals.map((batch:any):InstallationArrivalBatch=>{
    if(!batch||typeof batch!=='object'||Array.isArray(batch))fail('到货批次格式无效');
    const batchId=text(batch.id,100);if(!batchId||ids.has(batchId))fail('到货批次编号无效或重复');ids.add(batchId);
    return {id:batchId,description:text(batch.description??'',500),expected:date(text(batch.expected??'',10)),actual:date(text(batch.actual??'',10))};
   });
  }
  if(action==='client-confirm'){
   if(!previous.factory.confirmed)fail('请先由销售管理层确认工厂人员与排期');
   requireFields(['site_contact','airport','buyer','cost']);
   if(values.documents_ready&&(!values.visa_type||values.visa_type.includes('待')||!values.visa_duration||values.visa_duration.includes('待')))fail('请登记已核实的签证类型及时长；国内订单可注明不适用');
   if(plan.arrivals?.some(batch=>!batch.expected))fail('请补齐每批货的预计到货日期后再确认；日期未定可先保存准备进度');
  }
  const changed=INSTALLATION_CLIENT_FIELDS.some(([k])=>values[k]!==previous.client[k])||JSON.stringify(plan.arrivals||[])!==JSON.stringify(previous.arrivals||[]);
  plan.client={...values,confirmed:action==='client-confirm'} as InstallationPlan['client'];
  if(previous.travel.issued&&(changed||!plan.client.confirmed||!installationReady(plan))){plan.travel.reconfirmation=true;plan.acceptance.installed=false;plan.acceptance.accepted=false;}
 }
 if(section==='travel'){
  if(!installationReady(previous))fail('人员、客户、出行资料及费用未确认齐全，不能登记出票');
  requireFields(['flight','departure_date','arrival_date','evidence']);
  if(values.departure_date!==previous.factory.departure_date)fail('出票出发日期与已确认排期不一致，请先由销售管理层更新排期并重新确认客户行程');
  if(values.departure_date<previous.factory.available_date||values.arrival_date<values.departure_date)fail('行程日期与工厂可出发时间不符，请重新核对');
  plan.travel={...values,issued:true,reconfirmation:false};
 }
 if(section==='acceptance'){
  if(!previous.travel.issued||previous.travel.reconfirmation||!installationReady(previous))fail('请先完成并核实安装行程');
  if(values.accepted&&!values.installed)fail('请先确认安装完成，再登记客户验收');
  if(values.installed||values.accepted)requireFields(['actual_end','evidence']);
  plan.acceptance=values as InstallationPlan['acceptance'];
 }
 if(section==='factory'&&Object.hasOwn(body,'remarks'))plan.profile.remarks=text(body.remarks,5000);
 const names:Record<string,string>={profile:'更新安装项目资料',remarks:'更新安装备注','factory-draft':'保存工厂安排草稿','factory-confirm':'确认工厂人员并交接商务','client-save':'保存商务准备进度','client-confirm':'确认客户及出行准备','travel-confirm':previous.travel.issued?'更新出票及行程确认':'登记出票及最终行程','acceptance-save':'更新安装与客户验收'};
 const at=now(),revision=id(),payload={entity:p.key,plan,action:names[action]};
 const result=await db.prepare(`INSERT INTO crm_sales_events(id,kind,payload,lead_id,project_id,occurred_at,created,created_by) SELECT ?,?,?,?,?,?,?,? WHERE COALESCE((SELECT id FROM crm_sales_events WHERE kind=? AND json_extract(payload,'$.entity') IN (${p.aliases.map(()=>'?').join(',')}) ORDER BY rowid DESC LIMIT 1),'')=?`).bind(revision,kind,JSON.stringify(payload),p.lead.id,p.projectId,at,at,actor.id,kind,...p.aliases,current?.revision||'').run();
 if(!result.meta.changes)fail('安装安排已被其他人更新，请刷新后重新填写',409);
 return {ok:true,entity:p.key,revision};
}
