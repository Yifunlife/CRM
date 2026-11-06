const digits=value=>String(value||'').replace(/\D/g,'').replace(/^00/,'');
const email=value=>String(value||'').trim().toLowerCase();
const wonCustomer=c=>!!c&&([2,4,5,6,7,8,9].includes(Number(c.stage))||c.status==='已成交'||['已成交','已交付'].includes(c.projectStatus)||!!String(c.contractNumber||'').trim());
const terminal=row=>!['not_sent','confirmed_not_sent'].includes(row.status)&&!row.preSendNotLaunched;
async function firstContact({phonePolicy,command,config,getClient,clients,read,draft,archive,whatsappHistory,normalizePhone,sendWhatsApp,sendEmail,active,refreshFollowup}){
 if(wonCustomer(getClient(command.desktop_id)))return{status:'skipped',detail:'已成交客户，已排除自动联系'};
 const p=command.payload,id=command.desktop_id,followup=p.auto_followup_24h===true,historical=p.auto_historical_first_contact===true,approvedAt=historical?p.historical_approved_at:p.assigned_at;
 if(!config.autoFirstContact||!p.auto_first_contact||config.owner_id!==config.autoFirstContact.owner_id||(!followup&&(!Number.isFinite(Date.parse(approvedAt))||!Number.isFinite(Date.parse(config.autoFirstContact.assigned_from))||Date.parse(approvedAt)<Date.parse(config.autoFirstContact.assigned_from))))throw Error('自动首联未授权或分配时间早于启用时间');
 if(followup&&(!Number.isFinite(Date.parse(p.first_at))||Date.now()-Date.parse(p.first_at)<86400000))throw Error('首次成功联系尚未满24小时');
 if(followup||historical){if(typeof refreshFollowup!=='function')throw Error('工作台缺少跟进发送前检查');await refreshFollowup();}
 let phone=p.recipient_key;
 const guard=()=>{const c=getClient(id);return active()&&!!c&&!wonCustomer(c)&&!c.deleted&&!c.group&&!['Yifun Staff','同事'].includes(c.grade)&&String(c.owner).toLowerCase()===String(config.localOwner).toLowerCase()&&c.name===p.name&&c.country===p.country&&(p.channel==='email'?email(c.email)===p.recipient_key:[p.recipient_key,phone].includes(digits(c.whatsapp)))&&![draft(id,'email'),draft(id,'whatsapp')].some(d=>String(d?.draft||'').trim()||d?.chinesePending);};
 if(!guard())throw Error('客户资料、归属或人工草稿已变化，自动首联未发送');
 const c=getClient(id);
 const receipts=['whatsapp-outbox.json','crm-mail-outbox.json','outlook-graph-outbox.json','outlook-web-outbox.json','mac-mail-outbox.json','winnie-email-outreach.json'].flatMap(name=>read(name,[]).map(r=>({...r,receiptChannel:name==='whatsapp-outbox.json'?'whatsapp':'email'})));
 if(receipts.some(r=>(r.clientId===id||p.channel==='email'&&email(r.recipient)===p.recipient_key||p.channel==='whatsapp'&&digits(r.jid?.split('@')[0]||r.phone)===p.recipient_key)&&(!followup||r.receiptChannel===p.channel)&&terminal(r)&&!(p.channel==='email'&&r.automaticFirstContact===true&&r.status==='preparing'&&r.messageId&&!r.sendRequestedAt)))return{status:'skipped',detail:'已有联系或待核实发送记录，不重复首联'};
 const history=archive(c)||[],outgoing=m=>m.outgoing===true||/^(?:winnie(?:\s+wu)?(?:\s*\(Email\))?|我方|me)$/i.test(m.speaker||'');
 const reply=()=>(followup||historical)&&(archive(getClient(id))||[]).find(m=>m.outgoing===false||m.speaker&&!outgoing(m));
 const incoming=reply();if(incoming){const at=Date.parse(incoming.timestamp||[incoming.date,incoming.time].filter(Boolean).join(' '));return{status:'skipped',detail:'客户已有回复，已取消24小时自动跟进',...(Number.isFinite(at)?{replyAt:new Date(at).toISOString(),replyChannel:incoming.channel}: {})};}
 const check=async()=>{if(followup||historical){await refreshFollowup();if(reply())throw Error('客户已回复，停止自动跟进');}if(!guard())throw Error('客户或工作区变化，已停止自动联系');};
 if(history.some(m=>outgoing(m)&&(!followup||!m.channel||m.channel===p.channel)))return{status:'skipped',detail:'已有发给客户的历史消息，不重复首联'};
 if(p.channel==='email'){
  if(clients().some(other=>!other.deleted&&other.id!==id&&email(other.email)===email(c.email)))throw Error('邮箱与其他客户重合，自动首联待核对');
  const result=await sendEmail(c,check);
  return{status:result.status,messageId:result.messageId||'',text:result.body||'',detail:result.reason||result.detail||'',sentAt:result.sentAt||''};
 }
 if(p.channel!=='whatsapp'||!String(p.text||'').trim())throw Error('自动首联渠道或话术无效');
 const countries={SA:'沙特阿拉伯',EG:'埃及',US:'美国',ID:'印度尼西亚',MY:'马来西亚',NZ:'新西兰',LB:'黎巴嫩',KW:'科威特',QA:'卡塔尔'};
 const normalized=phonePolicy.normalizePhone(countries[c.country]||c.country,c.whatsapp);
 if(!normalized.phone)throw Error(normalized.reason);
 phone=normalized.phone;
 if(clients().some(other=>!other.deleted&&other.id!==id&&digits(other.whatsapp)===phone))throw Error('号码与其他客户重合，自动首联待核对');
 if(await whatsappHistory(phone))return{status:'skipped',detail:'WhatsApp已有发出记录，不重复首联'};
 if(!guard())throw Error('客户资料或工作区已变化，自动首联未发送');
 if(String(c.whatsapp).trim()!=='+'+phone)normalizePhone(id,'+'+phone);
 await check();
 const result=await sendWhatsApp(c,p.text,()=>guard()&&!reply());
 return{status:result.status,messageId:result.messageId||'',text:p.text,detail:result.detail||'',sentAt:result.sentAt||''};
}
module.exports={firstContact};
