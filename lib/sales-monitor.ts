import {can,now} from './crm';
import {AllocationError} from './allocation-server';
import {assignmentReminders} from './assignment-reminders';
export type MonitorItem={id:string;stage:string;level:'异常'|'待确认'|'待处理'|'到期提醒'|'历史对齐';title:string;evidence:string;suggestion:string;owner_id:string;owner_name:string;lead_id?:string;project_id?:string;order_id?:string;page:string;count:number};
const list=async(db:D1Database,sql:string,args:any[]=[]) => (await db.prepare(sql).bind(...args).all<any>()).results;
export async function salesMonitor(db:D1Database,source:D1Database|undefined,u:any,path:string,method:string){
 if(path!=='sales-monitor')return undefined;
 if(!['sales','admin','ceo','management'].includes(u.role))throw new AllocationError('没有销售监控查看权限',403);
 if(method!=='GET')throw new AllocationError('监控平台仅提供查看和业务入口',405);
 const all=can(u,'customers_all'),orderAll=all&&can(u,'followup_all'),scope=all?'1=1':'l.owner_id=?',args=all?[]:[u.id];
 const orderScope=orderAll?'1=1':'o.commercial_id=?',orderArgs=orderAll?[]:[u.id];
 const [people,projects,quotes,confirmations,orders,requests,salesNotices,orderNotices,devices,run,unassigned]=await Promise.all([
  list(db,'SELECT id,name FROM crm_users WHERE active=1 AND '+(all?"role IN ('sales','ceo')":'id=?')+' ORDER BY name',args),
  list(db,'SELECT p.project_id,p.lead_id,p.stage,p.next_action,p.name,l.owner_id,u.name AS owner_name FROM crm_sales_projects p JOIN crm_leads l ON l.id=p.lead_id LEFT JOIN crm_users u ON u.id=l.owner_id WHERE '+scope,args),
  list(db,'SELECT q.id,q.quote_id,q.project_id,q.sync_error,q.summary,p.lead_id,l.owner_id,u.name AS owner_name FROM crm_sales_quote_links q JOIN crm_sales_projects p ON p.project_id=q.project_id JOIN crm_leads l ON l.id=p.lead_id LEFT JOIN crm_users u ON u.id=l.owner_id WHERE '+scope,args),
  list(db,'SELECT c.project_id,c.order_id,o.id AS existing_order FROM crm_contract_confirmations c JOIN crm_sales_projects p ON p.project_id=c.project_id JOIN crm_leads l ON l.id=p.lead_id LEFT JOIN crm_followup_orders o ON o.id=c.order_id WHERE '+scope,args),
  list(db,'SELECT o.id,o.order_number,o.project,o.lead_id,o.archived,o.commercial_id,o.commercial_revision,u.name AS owner_name FROM crm_followup_orders o LEFT JOIN crm_users u ON u.id=o.commercial_id WHERE '+orderScope,orderArgs),
  list(db,"SELECT r.id,r.order_id,r.kind,r.state,r.commercial_revision FROM crm_release_requests r JOIN crm_followup_orders o ON o.id=r.order_id WHERE r.state='pending' AND o.archived=0 AND r.commercial_revision=o.commercial_revision AND "+orderScope,orderArgs),
  list(db,"SELECT n.id,n.project_id,n.lead_id,n.title,n.created,n.recipient_id,u.name AS recipient_name FROM crm_sales_notifications n JOIN crm_leads l ON l.id=n.lead_id JOIN crm_users u ON u.id=n.recipient_id WHERE n.resolved_at='' AND n.dedupe_key NOT LIKE 'quote-ready:%' AND "+scope+(all?'':' AND n.recipient_id=?'),all?[]:[u.id,u.id]),
  list(db,"SELECT n.id,n.order_id,n.title,n.created,n.recipient_id,u.name AS recipient_name FROM crm_followup_notifications n JOIN crm_followup_orders o ON o.id=n.order_id JOIN crm_users u ON u.id=n.recipient_id WHERE n.resolved_at='' AND o.archived=0 AND "+orderScope+(orderAll?'':' AND (n.recipient_id=? OR o.commercial_id=?)'),orderAll?[]:[u.id,u.id,u.id]),
  list(db,'SELECT d.owner_id,d.status,d.enabled,d.seen,d.desired,u.name FROM crm_linked_devices d JOIN crm_users u ON u.id=d.owner_id WHERE d.enabled=1 AND '+(all?'1=1':'d.owner_id=?'),args),
  db.prepare("SELECT finished,count FROM crm_followup_notification_run WHERE id='main'").first<any>(),
  all?list(db,"SELECT cohort,COUNT(*) AS count FROM crm_leads WHERE owner_id IS NULL GROUP BY cohort"):Promise.resolve([])
 ]);
 const items:MonitorItem[]=[];
 const add=(v:Omit<MonitorItem,'count'> & {count?:number})=>items.push({...v,count:v.count||1});
 const assigned=await Promise.all(people.map(async p=>({p,rows:(await assignmentReminders(db,{...u,id:p.id})).filter(l=>l.assignment_category==='new')})));
 for(const {p,rows} of assigned)if(rows.length)add({id:'first:'+p.id,stage:'客户',level:'待处理',title:'新增客资待首次联系',evidence:`${rows.length} 条新增分配客资尚无符合规则的首次联系记录。`,suggestion:'打开客户看板核对，并记录真实联系结果。',owner_id:p.id,owner_name:p.name,page:'客户看板',count:rows.length,lead_id:rows[0].id});
 for(const r of unassigned)if(r.count)add({id:'unassigned:'+r.cohort,stage:'客户',level:r.cohort==='historical'?'历史对齐':'待处理',title:r.cohort==='historical'?'历史客资归属待对齐':r.cohort==='new'?'新增客资待分配':'原始日期待核对',evidence:`${r.count} 条记录尚未关联负责人。`,suggestion:r.cohort==='historical'?'从旧数据库对齐原归属；不计新增分配或首次联系逾期。':'在客户管理核对原始日期、原归属后按现有规则处理。',owner_id:'',owner_name:'管理者',page:'工作台',count:r.count});
 for(const p of projects)if(!['won','lost','paused'].includes(p.stage)&&!p.next_action?.trim())add({id:'next:'+p.project_id,stage:'项目',level:'待处理',title:p.name+'：缺少下一步计划',evidence:'项目仍在推进，未填写下一步行动。',suggestion:'与负责业务员确认当前进度和下一步安排。',owner_id:p.owner_id,owner_name:p.owner_name||'待确认',lead_id:p.lead_id,project_id:p.project_id,page:'客户与项目'});
 for(const q of quotes){
  const summary=JSON.parse(q.summary||'{}');
  if(q.sync_error)add({id:'sync:'+q.id,stage:'报价',level:'异常',title:'报价关联同步失败',evidence:q.sync_error,suggestion:'进入报价与协作核查版本及账号，使用现有同步入口重试。',owner_id:q.owner_id,owner_name:q.owner_name||'待确认',lead_id:q.lead_id,project_id:q.project_id,page:'报价与协作'});
  const project=projects.find(p=>p.project_id===q.project_id);
  if(project&&!['won','lost','paused'].includes(project.stage)&&!confirmations.some(c=>c.project_id===q.project_id)&&summary.versions?.some((v:any)=>v.id===q.quote_id&&v.is_finalized&&!v.voided_at&&!v.archived_at))add({id:'contract:'+q.id,stage:'合同',level:'待确认',title:project.name+'：成交报价待交接确认',evidence:'已接收报价的当前版本已最终确认，尚无合同进入执行确认。',suggestion:'由所属销售核查合同和交接资料、选择跟单负责人，再确认进入执行。',owner_id:q.owner_id,owner_name:q.owner_name||'待确认',lead_id:q.lead_id,project_id:q.project_id,page:'报价与协作'});
  if(summary.available===false)add({id:'invalid:'+q.id,stage:'报价',level:'待处理',title:'已关联报价当前不可用',evidence:'当前摘要显示报价不可用；可能已作废、归档或失单。',suggestion:'核对报价当前状态，再决定修订、接收新版本或结束项目。',owner_id:q.owner_id,owner_name:q.owner_name||'待确认',lead_id:q.lead_id,project_id:q.project_id,page:'报价与协作'});
 }
 for(const c of confirmations)if(!c.existing_order){const p=projects.find(p=>p.project_id===c.project_id);if(p)add({id:'missing-order:'+c.project_id,stage:'合同',level:'异常',title:'合同确认与订单关联异常',evidence:'已有合同进入执行确认，但对应订单未找到。',suggestion:'请管理员按项目编号排查；先核查原记录，避免重复建单。',owner_id:p.owner_id,owner_name:p.owner_name||'待确认',project_id:p.project_id,lead_id:p.lead_id,page:'报价与协作'});}
 for(const r of requests){const o=orders.find(o=>o.id===r.order_id);if(o)add({id:'release:'+r.id,stage:'跟单',level:'待确认',title:o.project+'：'+(r.kind==='special'?'CEO 特殊放行待审批':'付款放行待确认'),evidence:'申请仍待处理，且对应当前商务资料版本。',suggestion:r.kind==='special'?'由 CEO 核查申请及依据后审批。':'由所属销售核查付款和上传单据，再按现有流程确认。',owner_id:o.commercial_id,owner_name:o.owner_name||'待确认',order_id:o.id,lead_id:o.lead_id,page:'订单跟单'});}
 for(const n of salesNotices)add({id:'sales-notice:'+n.id,stage:'项目',level:'到期提醒',title:n.title,evidence:'已生成的站内通知｜'+n.created,suggestion:'进入对应项目核查、跟进并记录结果。',owner_id:n.recipient_id,owner_name:n.recipient_name,lead_id:n.lead_id,project_id:n.project_id||undefined,page:'客户与项目'});
 for(const n of orderNotices){const o=orders.find(o=>o.id===n.order_id);if(o)add({id:'order-notice:'+n.id,stage:'跟单',level:/逾期|到期|提醒/.test(n.title)?'到期提醒':'待处理',title:n.title,evidence:o.project+'｜已生成的站内通知｜'+n.created,suggestion:'打开原订单处理对应事项，保留实际执行及修改记录。',owner_id:n.recipient_id,owner_name:n.recipient_name,order_id:o.id,lead_id:o.lead_id,page:'订单跟单'});}
 for(const d of devices)if(d.status==='connected'&&Date.now()-d.seen>=20000||d.status==='error'||['connect','reconnect'].includes(d.desired)&&d.status!=='connected')add({id:'device:'+d.owner_id,stage:'连接',level:'异常',title:d.name+'：WhatsApp 连接待检查',evidence:d.status==='connected'?'连接服务最近20秒没有上报在线状态。':'该账号的连接尚未完成或需要重新连接。',suggestion:'由该账号在客户沟通中检查连接；监控页不代发消息。',owner_id:d.owner_id,owner_name:d.name,page:'销售工作台'});
 let quoteConnection='已连接';
 if(source){try{
  const tables=await list(source,"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('quotation_history','quotation_crm_messages','app_users')");if(tables.length!==3)throw Error('Quote source incomplete');
  const links=await list(db,'SELECT a.user_id,a.quote_email,u.name FROM crm_sales_account_links a JOIN crm_users u ON u.id=a.user_id WHERE u.active=1 AND '+(all?'1=1':'a.user_id=?'),args);
  if(!links.length)quoteConnection='尚未关联报价账号';
  for(const p of links){const rows=await list(source,"SELECT DISTINCT q.id,q.project_name FROM quotation_history q JOIN quotation_crm_messages m ON m.quotation_id=q.id JOIN app_users a ON a.email=m.author AND a.status='active' WHERE m.direction='quote' AND m.kind='业务员确认报价' AND m.author=? AND q.created_by=? AND q.voided_at IS NULL AND q.archived_at IS NULL AND q.project_status<>'lost'",[p.quote_email,p.quote_email]);for(const q of rows)if(!await db.prepare('SELECT quote_id FROM crm_quote_acceptances WHERE quote_id=?').bind(q.id).first())add({id:'accept:'+q.id,stage:'报价',level:'待确认',title:q.project_name+'：报价待接收',evidence:'业务员已在报价系统确认，此版本尚未在 CRM 接收。',suggestion:'由所属业务员选择对应客户并确认接收，系统随后自动建档。',owner_id:p.user_id,owner_name:p.name,page:'报价与协作'});}
 }catch{quoteConnection='暂时无法读取';}}else quoteConnection='未配置';
 const order=['异常','待确认','到期提醒','待处理','历史对齐'];items.sort((a,b)=>order.indexOf(a.level)-order.indexOf(b.level)||a.id.localeCompare(b.id));
 return {at:now(),scope:all?'全团队':'本人',items,people,summary:{customers:assigned.reduce((n,x)=>n+x.rows.length,0),projects:projects.length,orders:orders.filter(o=>!o.archived).length,exceptions:items.filter(i=>i.level==='异常').length},sources:{quote:quoteConnection,daily:run?.finished||'',reminderRule:'每天北京时间 08:00 检查到期事项；业务操作后立即同步'},team:all?people.map(p=>({...p,items:items.filter(i=>i.owner_id===p.id).length,exceptions:items.filter(i=>i.owner_id===p.id&&i.level==='异常').length})):[]};
}
