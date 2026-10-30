import {suiteDay} from './sales-suite';
export type WorkTodo={id:string;kind:string;title:string;customer:string;date:string;due:string;timeLabel:string;detail:string;item:any};
export const todoDay=(value:string)=>value.length===10?value:suiteDay(value);
const taskDate=(t:any)=>[t.next_followup,t.due_at||t.due].filter(Boolean).sort()[0]||'';
export function workProjectGroups(projects:any[],userId:string,today=suiteDay()){
 const active=[...new Map(projects.filter(p=>p.owner_id===userId&&!['won','lost'].includes(p.stage)).map(p=>[p.project_id,p])).values()];
 const issues=(p:any)=>[p.next_date&&p.next_date<today?'跟进逾期':'',!p.next_action?.trim()?'缺少下一步':'',!p.next_date?'未安排跟进日期':'',p.blocker?.trim()?'卡点：'+p.blocker:''].filter(Boolean);
 return {due:active.filter(p=>p.next_date&&p.next_date<=today),exceptions:active.filter(p=>issues(p).length).map(p=>({...p,issues:issues(p)}))};
}
export function workTodos(data:any,legacy:any,user:any,quotes:any[]=[],handovers:any[]=[],releases:any[]=[],at=new Date().toISOString()):WorkTodo[]{
 const today=suiteDay(at),rows:WorkTodo[]=[],leads=new Map<string,WorkTodo>();
 for(const q of quotes)rows.push({id:'quote:'+q.id,kind:'报价接收',title:q.contract_no||'待接收报价',customer:q.customer_name||q.project_name,date:q.created_at||'',due:'',timeLabel:'收到',detail:q.project_name||'',item:q});
 for(const l of data.assigned_leads||[])if(l.assignment_category==='new')leads.set(l.id,{id:'lead:'+l.id,kind:'新增客资',title:'联系客户',customer:l.name,date:l.assigned_at||'',due:'',timeLabel:'分配',detail:[l.country,l.source].filter(Boolean).join(' · '),item:l});
 for(const l of legacy?.todos||[]){const assigned=leads.get(l.id);leads.set(l.id,{id:'lead:'+l.id,kind:assigned?'新增客资':'客户跟进',title:l.next_step||l.reasons?.join('；')||'跟进客户',customer:l.name,date:l.due||l.next_date||assigned?.date||'',due:l.due||l.next_date||'',timeLabel:l.due||l.next_date?'跟进':'分配',detail:assigned?.detail||l.requirement||'',item:{...assigned?.item,...l}});}
 rows.push(...leads.values());
 for(const t of data.tasks||[])if(t.owner_id===user.id&&t.status==='open'&&(!taskDate(t)||todoDay(taskDate(t))<=today))rows.push({id:'task:'+t.id,kind:'协作任务',title:t.title,customer:[t.customer_name,t.project_name].filter(Boolean).join(' / '),date:taskDate(t),due:taskDate(t),timeLabel:taskDate(t)===t.next_followup?'跟进':'截止',detail:t.next_action||'',item:t});
 for(const t of legacy?.tasks||[])if((t.owner_id===user.id||t.mine===true)&&(!taskDate(t)||todoDay(taskDate(t))<=today))rows.push({id:'order:'+t.id,kind:'订单事项',title:t.title,customer:t.order_number||'',date:taskDate(t),due:taskDate(t),timeLabel:taskDate(t)===t.next_followup?'跟进':'截止',detail:t.next_action||'',item:t});
 for(const h of handovers)if(h.state==='待接收'&&h.to_id===user.id)rows.push({id:'handover:'+h.id,kind:'业务交接',title:h.to_id===user.id?'待接收交接':'等待对方接收',customer:h.label||[h.from_name,h.to_name].filter(Boolean).join(' → '),date:h.created||'',due:'',timeLabel:'发起',detail:h.reason||'',item:h});
 const projectGroups=workProjectGroups(data.projects||[],user.id,today),exceptionIds=new Map(projectGroups.exceptions.map(p=>[p.project_id,p.issues]));
 for(const p of [...new Map([...projectGroups.due,...projectGroups.exceptions].map(p=>[p.project_id,p])).values()])rows.push({id:'project:'+p.project_id,kind:'项目跟进',title:p.next_action||'安排下一步',customer:[p.customer_name,p.name].filter(Boolean).join(' / '),date:p.next_date||'',due:p.next_date||'',timeLabel:'跟进',detail:(exceptionIds.get(p.project_id)||[]).join('；'),item:p});
 for(const n of data.notifications||[])if(!n.read_at&&!n.resolved_at&&!rows.some(r=>r.id==='task:'+n.task_id||n.dedupe_key?.startsWith('project:')&&r.id==='project:'+n.project_id||n.dedupe_key?.startsWith('dormant:')&&r.id==='lead:'+n.lead_id))rows.push({id:'notice:'+n.id,kind:'项目提醒',title:n.title,customer:(data.projects||[]).find((p:any)=>p.project_id===n.project_id)?.customer_name||(data.leads||[]).find((l:any)=>l.id===n.lead_id)?.name||'',date:n.created||'',due:'',timeLabel:'提醒',detail:n.content||'',item:n});
 for(const r of releases)if(r.state==='pending')rows.push({id:'release:'+r.id,kind:'放行审批',title:'特殊放行待审批',customer:r.order_number||'',date:r.created||'',due:'',timeLabel:'申请',detail:r.reason||'',item:r});
 const rank=(r:WorkTodo)=>r.kind==='新增客资'?0:r.kind==='报价接收'?1:r.due&&todoDay(r.due)===today?2:r.due&&todoDay(r.due)<today?3:r.kind==='业务交接'?4:5;
 const duplicates=new Set(rows.filter(r=>r.kind==='客户跟进'&&rows.some(p=>p.kind==='项目跟进'&&p.item.lead_id===r.item.id&&p.due===r.due&&p.title.trim()===r.title.trim())).map(r=>r.id));
 return [...new Map(rows.filter(r=>!duplicates.has(r.id)).map(r=>[r.id,r])).values()].sort((a,b)=>rank(a)-rank(b)||(a.due||a.date||'9999').localeCompare(b.due||b.date||'9999')||a.id.localeCompare(b.id));
}
