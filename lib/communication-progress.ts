import {digest} from './crm';
import {salesState,salesSummary} from './sales-pipeline';
export async function recordCommunication(db:D1Database,owner:string,leadId:string,event:string,content:string,incoming:boolean,occurred:string){
 const stamp=Date.parse(occurred);if(!Number.isFinite(stamp)||stamp>Date.now()+300000)throw new Error('沟通发生时间无效');
 const at=new Date(stamp).toISOString(),key='communication-'+await digest(owner+':'+event);
 for(let attempt=0;attempt<3;attempt++){
  const lead:any=await db.prepare('SELECT * FROM crm_leads WHERE id=? AND owner_id=?').bind(leadId,owner).first();if(!lead)return;
  if(await db.prepare('SELECT id FROM crm_notes WHERE id=?').bind(key).first())return;
  const state=salesState(lead),version=state.version,summary=salesSummary(lead,at);
  if(incoming){if(!state.reply_at||at>state.reply_at)state.reply_at=at;if(!state.stage){state.stage='replied';state.stage_at=at;}}
  else{
   if(!state.required)state.required=[...(lead.phone?['whatsapp']:[]),...(lead.email?['email']:[])];
   if(!state.first.whatsapp)state.first.whatsapp={at,note:content};
   else if(summary.first_at&&at>summary.first_at&&!state.second.whatsapp)state.second.whatsapp={at,note:content};
  }
  state.version++;
  const recent=!lead.last_contact||at>=lead.last_contact;
  const status=['待首次联系','已联系待回复','正在沟通'].includes(lead.status)&&recent?(incoming||lead.status==='正在沟通'?'正在沟通':'已联系待回复'):lead.status;
  let next=lead.next_date;
  if(recent&&!['已成交','已结束','暂停跟进'].includes(lead.status)&&(!next||next===state.auto_next_date)){next=new Date(stamp+(incoming?0:7*86400000)).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});state.auto_next_date=next;state.auto_message_at=at;}
  const result=await db.batch([
   db.prepare("INSERT OR IGNORE INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_leads WHERE id=? AND owner_id=? AND COALESCE(json_extract(detail,'$._sales_progress.version'),0)=? AND next_date IS ? AND last_contact IS ?)").bind(key,leadId,owner,(incoming?'客户回复':'发送已确认')+'｜'+content,incoming?'系统收信':'WhatsApp',incoming?'查看客户回复并安排下一步':'按期跟进',at,leadId,owner,version,lead.next_date,lead.last_contact),
   db.prepare("UPDATE crm_leads SET detail=json_set(detail,'$._sales_progress',json(?)),last_contact=?,status=?,next_date=? WHERE id=? AND owner_id=? AND COALESCE(json_extract(detail,'$._sales_progress.version'),0)=? AND next_date IS ? AND last_contact IS ? AND EXISTS(SELECT 1 FROM crm_notes WHERE id=?)").bind(JSON.stringify(state),recent?at:lead.last_contact,status,next,leadId,owner,version,lead.next_date,lead.last_contact,key)
  ]);
  if(result[1].meta.changes)return;
 }
 throw new Error('客户资料正在更新，请重新同步消息');
}
