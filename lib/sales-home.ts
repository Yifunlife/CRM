import {salesDay,salesSummary} from './sales-pipeline';
import {nextChinaWorkday} from './china-workdays';

export const HOME_QUEUES=[['all','全部待办'],['overdue','已逾期'],['today','今日到期'],['first','首次联系'],['inquiry','新咨询'],['unscheduled','待安排']] as const;
export function homeCustomer(lead:any,at:string,deals:any[]=[]){
 const progress=salesSummary(lead,at,[],deals),today=salesDay(at),detail=typeof lead.detail==='string'?JSON.parse(lead.detail):lead.detail;
 const closed=['已成交','已结束'].includes(lead.status),paused=lead.status==='暂停跟进';
 const first=lead.cohort==='new'&&!closed&&!paused&&['untouched','partial'].includes(progress.stage);
 const firstDue=first?nextChinaWorkday(lead.assigned_at):null;
 const dates=[!closed?lead.next_date:'',firstDue,lead.cohort==='new'&&!closed&&!paused&&!progress.second_at?progress.second_due:''].filter(Boolean).sort();
 const due=dates[0]||'',inquiry=!closed&&!paused&&!!lead.inquiry_at;
 const tags:string[]=[];
 if(due&&due<today)tags.push('overdue');else if(due===today)tags.push('today');
 if(first)tags.push('first');if(inquiry)tags.push('inquiry');if(lead.cohort==='new'&&!closed&&!lead.next_date)tags.push('unscheduled');
 const reasons=[due&&due<=today?`${due<today?'已逾期':'今日到期'} · ${due}`:'',first?(progress.stage==='partial'?'首次联系渠道待补齐':'尚未完成首次联系'):'',inquiry?'有新咨询待核对':'',lead.cohort==='new'&&!closed&&!lead.next_date?'尚未安排下次跟进':''].filter(Boolean);
 const {state,required,...summary}=progress;
 const latestProgress=[...Object.values(state.first),...Object.values(state.second)].sort((a,b)=>b.at.localeCompare(a.at))[0];
 return {...summary,country:lead.country||'',company:detail?.['公司名称']||'',requirement:detail?.['项目需求描述']||detail?.['项目类型']||'',budget:detail?.['投资预算']||'',status:lead.status,next_date:lead.next_date||'',last_contact:lead.last_contact||'',last_note:lead.last_note||latestProgress?.note||'',next_step:lead.next_step||'',due,tags,reasons,priority:tags.includes('overdue')?0:tags.includes('today')?1:inquiry?2:first?3:4};
}
export function sortHomeCustomers(a:any,b:any){return a.priority-b.priority||(a.due||'9999').localeCompare(b.due||'9999')||(a.assigned_at||'9999').localeCompare(b.assigned_at||'9999')||a.id.localeCompare(b.id);}
