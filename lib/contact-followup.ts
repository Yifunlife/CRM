import {preferredContact} from './auto-first-contact';
import {salesState} from './sales-pipeline';

type Evidence={whatsapp?:string;email?:string;last_sent?:string;reply_at?:string;issue_at?:string;issue_state?:string;unknown_history?:number};
const hour=3600000;
const label=(channel:string)=>channel==='email'?'邮件':'WhatsApp';
export function contactFollowup(lead:any,evidence:Evidence,at:string,automatic=false){
 const detail=typeof lead.detail==='string'?JSON.parse(lead.detail||'{}'):lead.detail||{};
 const state=salesState({detail}),now=Date.parse(at);
 if(lead.review||['已成交','已结束','暂停跟进','正在沟通'].includes(lead.status)||state.reply_at||evidence.reply_at||state.stage||lead.inquiry_at)return null;
 const stamp=(values:(string|undefined)[])=>values.filter((v):v is string=>!!v&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=now).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]||'';
 const sent={whatsapp:stamp([evidence.whatsapp,state.first.whatsapp?.at,state.second.whatsapp?.at]),email:stamp([evidence.email,state.first.email?.at,state.second.email?.at])};
 const first=stamp(Object.values(sent)),preferred=automatic&&first?(sent.whatsapp?'whatsapp':'email'):preferredContact(JSON.stringify(detail));
 if(automatic&&(!first||sent.whatsapp&&sent.email))return null;
 const fresh=lead.assignment_category?lead.assignment_category==='new':lead.cohort==='new';
 if(!first&&!fresh)return null;
 const alternate=preferred==='whatsapp'?'email':preferred==='email'?'whatsapp':'';
 const base={id:lead.id,name:lead.name,preferred,alternate,first_at:first,whatsapp_at:sent.whatsapp,email_at:sent.email,auto_next_date:state.auto_next_date||''};
 const result=(kind:string,title:string,reason:string,due_at='',rank=3)=>({...base,kind,title,reason,due_at,rank,actionable:kind!=='dormant'&&!!due_at&&now>=Date.parse(due_at)});
 if(evidence.issue_at&&Date.parse(evidence.issue_at)>=Date.parse(evidence.last_sent||first||'1970-01-01')&&Date.parse(evidence.issue_at)<=now){
  const pending=['queued','running'].includes(evidence.issue_state||'');
  return result('review',pending?'正在发送，请先等待结果':'先核对发送结果，再安排联系',pending?'当前联系任务尚未完成，不重复联系':'存在失败或结果待核实的发送记录，不能当作成功联系');
 }
 if(evidence.unknown_history)return result('review','先核对客户沟通历史','部分历史记录的收发方向或时间尚待核对，暂不判定客户未回复');
 const followup=detail._auto_followup_24h;
 if(followup?.state==='sent'&&Number.isFinite(Date.parse(followup.next_at))){const due=followup.next_at,ready=now>=Date.parse(due);return result(ready?'followup':'waiting',ready?'两种方式均未回复，按7天安排再次联系':'第二种方式已成功联系，7天后再联系','已完成两种方式联系，等待回复；保留7天后的跟进安排',due,ready?1:4);}
 if(!automatic&&first&&detail._contact_verified?.followup_mode==='normal')return null;
 const seven=first?new Date(Date.parse(first)+168*hour).toISOString():'';
 if(sent.whatsapp&&sent.email&&now>=Date.parse(seven))return result('dormant','已标记沉睡客户，无需继续联系','邮件和 WhatsApp 均已成功联系，首次成功联系满 7 天仍未记录回复，停止联系提醒',seven,5);
 if(!preferred)return first?null:result('review','核对客户首选联系方式','请查看原始咨询，确认首选邮件还是 WhatsApp');
 if(!lead[preferred==='email'?'email':'phone'])return result('review','核对并补充首选'+label(preferred)+'联系方式','缺少首选方式的有效联系资料，请先查看客户档案');
 if(!first){
  if(lead.status!=='待首次联系')return result('review','核对首次成功联系时间','尚无可靠的成功发送记录，暂不计算 24 小时或 7 天');
  return result('first','先用'+label(preferred)+'联系客户','确认首次成功发送后，开始计算 24 小时和 7 天');
 }
 if(!sent[preferred as 'email'|'whatsapp'])return result('review','核对首选方式的联系记录','已有其他渠道成功记录，请核对首选'+label(preferred)+'是否已联系');
 if(!lead[alternate==='email'?'email':'phone'])return result('review','核对并补充客户'+(alternate==='email'?'邮箱':'WhatsApp 号码'),'缺少第二种联系方式，尚未完成两种方式联系');
 const alternateAt=sent[alternate as 'email'|'whatsapp'];
 if(!alternateAt){
  const due=new Date(Date.parse(sent[preferred as 'email'|'whatsapp'])+24*hour).toISOString(),ready=now>=Date.parse(due);
  return result(ready?'alternate':'waiting',ready?'现在改用'+label(alternate)+'联系':'尚未满 24 小时，等待客户回复','首选'+label(preferred)+'已成功发送，'+label(alternate)+'尚无成功发送记录',due,ready?1:4);
 }
 return result('waiting','两种方式已联系，等待客户回复','满 7 天仍未回复时标记为沉睡客户，不再提醒联系',seven,4);
}
