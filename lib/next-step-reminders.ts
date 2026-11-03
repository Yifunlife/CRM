import {day,personalTodoDue} from './personal-work';

export function nextStepReminders(home:any,work:any){
 const rows=new Map<string,any>(),contacts=new Map<string,any>((home.contact_reminders||[]).map((r:any)=>[r.id,r]));
 const add=(row:any)=>rows.set(row.id,row);
 for(const r of contacts.values()){
  if(!['first','review'].includes(r.kind)&&!(r.kind==='alternate'&&r.actionable))continue;
  add({id:'customer:'+r.id,category:'客户跟进',target:'customer',target_id:r.id,name:r.name,title:r.title,description:r.reason,date:r.due_at||'',label:r.kind==='review'?'联系资料待核对':r.kind==='alternate'?'已到联系时间':'首次联系',rank:r.kind==='alternate'?1:3});
 }
 for(const r of home.todos||[]){
  const contact=contacts.get(r.id);
  if(contact?.kind==='dormant'||['已成交','已结束'].includes(r.status))continue;
  const scheduled=personalTodoDue(r.due,home.today),unscheduled=!r.due&&r.tags.some((tag:string)=>['first','inquiry','unscheduled'].includes(tag));
  if(!scheduled&&!unscheduled)continue;
  if(contact&&!r.tags.includes('inquiry')&&(!r.next_date||r.next_date===contact.auto_next_date))continue;
  add({id:'customer:'+r.id,category:'客户跟进',target:'customer',target_id:r.id,name:r.name,title:r.next_step||r.reasons.join('；'),description:contact?.reason||'',date:r.due||'',label:r.due?(r.due<home.today?'跟进已逾期':'今天跟进'):'待安排跟进',rank:r.tags.includes('overdue')?0:3});
 }
 for(const r of work.reminders||[]){
  if(r.page||r.completed)continue;
  const entity=r.id.startsWith('opening:')?r.id.slice('opening:'.length):'',split=entity.indexOf(':'),kind=entity.slice(0,split),key=entity.slice(split+1);
  add({...r,id:'reminder:'+r.id,category:kind==='order'?'跟单事项':'项目推进',target:kind==='order'?'order':kind==='sales'?'project':'customer',target_id:key&&['order','sales'].includes(kind)?key:r.lead_id,description:r.forecast||''});
 }
 for(const p of work.projects||[]){
  if(['won','lost'].includes(p.stage)||!personalTodoDue(p.next_date,home.today))continue;
  add({id:'project:'+p.project_id,category:'项目推进',target:'project',target_id:p.project_id,name:p.name,title:p.next_action||'跟进项目进度',description:p.customer_name,date:p.next_date,label:p.next_date<home.today?'项目跟进已逾期':'今天推进项目',rank:p.next_date<home.today?0:2});
 }
 for(const t of work.tasks||[]){
  const date=/^\d{4}-\d{2}-\d{2}$/.test(t.due_at)?t.due_at:day(t.due_at);
  if(t.status!=='open'||!personalTodoDue(date,home.today))continue;
  add({id:'task:'+t.id,category:t.order_id?'跟单事项':t.project_id?'项目推进':'客户跟进',target:t.order_id?'order':t.project_id?'project':'customer',target_id:t.order_id||t.project_id||t.lead_id,name:t.customer_name||t.title,title:t.next_action||t.title,description:t.title,date:t.due_at,label:date<home.today?'事项已逾期':'今天处理',rank:date<home.today?0:2});
 }
 for(const t of home.tasks||[]){
  if(t.status&&t.status!=='待处理'||!personalTodoDue(t.due,home.today))continue;
  add({id:'order:'+t.id,category:'跟单事项',target:'order',target_id:t.order_id,name:t.order_number,title:t.next_action||t.title,description:t.title,date:t.due,label:t.due<home.today?'跟单已逾期':'今天跟单',rank:t.due<home.today?0:2});
 }
 return [...rows.values()].sort((a,b)=>a.rank-b.rank||(a.date||'9999').localeCompare(b.date||'9999')||a.id.localeCompare(b.id));
}
