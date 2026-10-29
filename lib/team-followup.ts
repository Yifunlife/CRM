export const TEAM_QUEUES=[['attention','需介入'],['repeat','再次询问待处理'],['stale','长期未联系'],['unplanned','未安排下一步'],['assigned','已分配'],['uncontacted','未首次联系'],['unverified','历史跟进待核实'],['today','今日应跟进'],['overdue','逾期跟进'],['won','已成交']] as const;
export const teamDay=(at:string)=>new Date(at).toLocaleDateString('sv-SE',{timeZone:'Australia/Sydney'});
export function teamCustomer(lead:any,at:string){
 const today=teamDay(at),detail=typeof lead.detail==='string'?JSON.parse(lead.detail):lead.detail;
 const contacted=[lead.last_contact,lead.human_contact].filter(Boolean).sort().at(-1)||'';
 const closed=['已成交','已结束','暂停跟进'].includes(lead.status)||lead.deal_count>0;
 const uncontacted=!contacted&&lead.status==='待首次联系'&&!closed;
 const unverified=!contacted&&!uncontacted&&!closed;
 const repeat=!!lead.inquiry_at&&(!contacted||Date.parse(lead.inquiry_at)>Date.parse(contacted))&&!closed;
 const reference=contacted||lead.created;
 const waiting_days=reference&&Number.isFinite(Date.parse(reference))?Math.max(0,Math.floor((Date.parse(today)-Date.parse(teamDay(reference)))/86400000)):null;
 const stale=!closed&&waiting_days!==null&&waiting_days>=7;
 const unplanned=!closed&&(!String(lead.next_step||'').trim()||!lead.next_date);
 const flags={attention:repeat||stale||unplanned||(!closed&&!!lead.next_date&&lead.next_date<today),stale,unplanned,assigned:true,uncontacted,unverified,today:!closed&&lead.next_date===today,overdue:!closed&&!!lead.next_date&&lead.next_date<today,repeat,won:lead.deal_count>0};
 return {waiting_days,id:lead.id,name:lead.name,owner_id:lead.owner_id,phone:lead.phone,email:lead.email,country:lead.country,source:lead.source,business_scope:lead.business_scope,company:detail?.['公司名称']||'',requirement:detail?.['项目需求描述']||detail?.['项目类型']||'',status:lead.status,grade:lead.grade,last_contact:contacted,next_date:lead.next_date,last_note:lead.last_note||'',next_step:lead.next_step||'',inquiry_at:lead.inquiry_at||'',flags};
}
export function teamStaff(people:any[],rows:ReturnType<typeof teamCustomer>[]){
 return people.map(person=>({...person,...Object.fromEntries(TEAM_QUEUES.map(([key])=>[key,rows.filter(r=>r.owner_id===person.id&&r.flags[key]).length]))})).sort((a,b)=>b.repeat-a.repeat||b.stale-a.stale||b.unplanned-a.unplanned||b.overdue-a.overdue||b.uncontacted-a.uncontacted||a.name.localeCompare(b.name,'zh-CN'));
}
