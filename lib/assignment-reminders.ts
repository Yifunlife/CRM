import {assignmentCategory} from './assignment-categories';
const assignmentFields=`a.created AS assigned_at,a.policy AS assignment_policy,
 CASE WHEN a.policy='' AND l.original_owner=(SELECT name FROM crm_users WHERE id=a.owner_id)
 AND json_valid(l.detail) AND json_type(CASE WHEN json_valid(l.detail) THEN l.detail ELSE '{}' END,'$.分配同步来源')='object'
 AND a.id=(SELECT first.id FROM crm_assignments first WHERE first.lead_id=l.id ORDER BY first.created,first.rowid LIMIT 1)
 THEN 1 ELSE 0 END AS legacy_sync`;
// Derive unresolved work from ownership and recorded follow-up, never notification read state.
export async function assignmentReminders(db:D1Database,user:any){
 if(user.role==='followup')return [];
 return (await db.prepare(`WITH owned AS (
 SELECT l.id,l.name,l.country,l.source,l.status,l.created,l.owner_id,l.cohort,
 CASE WHEN json_valid(l.detail) THEN COALESCE(json_extract(l.detail,'$.inbox_url'),json_extract(l.detail,'$.收件箱链接')) END AS inbox_url,
 (SELECT name FROM crm_users WHERE id=l.owner_id) AS owner_name,
 (SELECT json_object('created',n.created,'author',u.name,'content',n.content,'method',n.method) FROM crm_notes n JOIN crm_users u ON u.id=n.user_id WHERE n.lead_id=l.id ORDER BY n.created DESC,n.rowid DESC LIMIT 1) AS latest_note,
 ${assignmentFields}
 FROM crm_leads l LEFT JOIN crm_assignments a ON a.id=(SELECT recent.id FROM crm_assignments recent WHERE recent.lead_id=l.id AND recent.owner_id=l.owner_id ORDER BY recent.created DESC,recent.rowid DESC LIMIT 1)
 WHERE l.owner_id=? AND l.review=0
 ) SELECT * FROM owned l WHERE (l.assigned_at IS NOT NULL OR l.status='待首次联系')
 AND NOT EXISTS(SELECT 1 FROM crm_notes n WHERE n.lead_id=l.id AND n.user_id=l.owner_id
 AND n.created>=COALESCE(l.assigned_at,l.created) AND trim(n.content)<>'' AND n.method NOT IN ('归属核正','表单咨询','系统导入','自动分配','系统收信'))
 ORDER BY COALESCE(l.assigned_at,l.created) DESC,l.id`).bind(user.id).all<any>()).results.map(l=>({...l,assignment_category:assignmentCategory(l)}));
}

export async function teamAssignmentSummary(db:D1Database,month:string,owner=''){
 const people=(await db.prepare(`SELECT u.id,u.name,u.role,u.active FROM crm_users u
 WHERE (u.role IN ('sales','ceo','management') OR EXISTS(SELECT 1 FROM crm_assignments a WHERE a.owner_id=u.id))
 AND (?='' OR u.id=?) ORDER BY u.active DESC,u.name`).bind(owner,owner).all<any>()).results;
 const allocatedEvents=(await db.prepare(`SELECT a.owner_id,a.lead_id,l.cohort,a.created AS allocated_at,${assignmentFields} FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE l.review=0 AND l.cohort='new' AND strftime('%Y-%m',a.created,'+8 hours')=? ORDER BY a.created,a.rowid`).bind(month).all<any>()).results;
 const allocated=[...new Map(allocatedEvents.map(a=>[a.owner_id+':'+a.lead_id,a])).values()].filter(a=>assignmentCategory(a)==='new');
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 const leads=(await db.prepare(`SELECT l.id,l.name,l.country,l.source,l.status,l.cohort,l.next_date,l.owner_id,u.name AS owner_name,
 ${assignmentFields},
 (SELECT json_object('created',n.created,'author',p.name,'content',n.content,'method',n.method) FROM crm_notes n JOIN crm_users p ON p.id=n.user_id WHERE n.lead_id=l.id AND n.method NOT IN ('归属核正','表单咨询','系统导入','自动分配','系统收信') ORDER BY n.created DESC,n.rowid DESC LIMIT 1) AS latest_note,
 EXISTS(SELECT 1 FROM crm_deals d WHERE d.lead_id=l.id AND d.cancelled=0) AS won
 FROM crm_leads l JOIN crm_users u ON u.id=l.owner_id LEFT JOIN crm_assignments a ON a.id=(SELECT recent.id FROM crm_assignments recent WHERE recent.lead_id=l.id AND recent.owner_id=l.owner_id ORDER BY recent.created DESC,recent.rowid DESC LIMIT 1) WHERE l.review=0`).all<any>()).results;
 const deals=(await db.prepare("SELECT d.owner_id,c.currency,c.total_minor FROM crm_deals d LEFT JOIN crm_workflow_contracts c ON c.deal_id=d.id WHERE d.cancelled=0 AND substr(d.deal_date,1,7)=?").bind(month).all<any>()).results;
 return Promise.all(people.map(async u=>{
  const ids=new Set(allocated.filter(a=>a.owner_id===u.id).map(a=>a.lead_id)),pending=await assignmentReminders(db,u),pendingIds=new Set(pending.map(l=>l.id));
  const owned=leads.filter(l=>l.owner_id===u.id).map(l=>{
   const assignment_month=l.assigned_at?new Date(l.assigned_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}).slice(0,7):'';
   const closed=['已成交','已结束','暂停跟进'].includes(l.status)||l.won;
   return {...l,assignment_category:assignmentCategory(l),latest_note:l.latest_note?JSON.parse(l.latest_note):null,assignment_month,followed:!pendingIds.has(l.id),waiting_days:l.assigned_at?Math.max(0,Math.floor((Date.parse(today)-Date.parse(new Date(l.assigned_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})))/86400000)):null,overdue_days:!closed&&l.next_date&&l.next_date<today?Math.floor((Date.parse(today)-Date.parse(l.next_date))/86400000):0};
  });
  const allocated_rows=[...ids].map(id=>{const l=leads.find(l=>l.id===id)!;return {...l,...(owned.find(x=>x.id===id)||{}),assigned_at:allocated.find(a=>a.owner_id===u.id&&a.lead_id===id)?.allocated_at,latest_note:l.latest_note?JSON.parse(l.latest_note):null,transferred:l.owner_id!==u.id||!owned.some(l=>l.id===id&&l.assignment_month===month)};});
  const current_all=owned.filter(l=>l.assignment_category==='new'&&l.assignment_month===month),current=current_all.filter(l=>!l.followed),history=owned.filter(l=>l.assignment_category==='new'&&!l.followed&&l.assignment_month&&l.assignment_month<month),historical_review=owned.filter(l=>l.assignment_category!=='new'&&!l.followed);
  const overdue=owned.filter(l=>l.assignment_category==='new'&&l.assignment_month<=month&&l.overdue_days>0).sort((a,b)=>b.overdue_days-a.overdue_days||a.name.localeCompare(b.name));
  const ownDeals=deals.filter(d=>d.owner_id===u.id),money:Record<string,number>={};for(const d of ownDeals)if(d.total_minor!=null)money[d.currency]=(money[d.currency]||0)+d.total_minor;
  return {id:u.id,name:u.name,active:u.active,allocated:ids.size,followed_month:current_all.filter(l=>l.followed).length,transferred_month:[...ids].filter(id=>!current_all.some(l=>l.id===id)).length,pending_month:current.length,pending_history:history.length,pending_unknown:0,pending:[...current,...history],current,history,unknown:[],historical_review,historical_review_count:historical_review.length,current_all,allocated_rows,transferred:allocated_rows.filter(l=>l.transferred),overdue,max_overdue:overdue[0]?.overdue_days||0,deals:ownDeals.length,money,missing_contracts:ownDeals.filter(d=>d.total_minor==null).length};
 }));
}
