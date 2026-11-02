const digits=value=>String(value||'').replace(/\D/g,'').replace(/^00/,'');
const email=value=>String(value||'').trim().toLowerCase();
const terminal=row=>!['not_sent','confirmed_not_sent'].includes(row.status)&&!row.preSendNotLaunched;
async function firstContact({phonePolicy,command,config,getClient,clients,read,draft,archive,whatsappHistory,normalizePhone,sendWhatsApp,sendEmail,active}){
 const p=command.payload,id=command.desktop_id;
 if(!config.autoFirstContact||!p.auto_first_contact||config.owner_id!==config.autoFirstContact.owner_id||!Number.isFinite(Date.parse(p.assigned_at))||!Number.isFinite(Date.parse(config.autoFirstContact.assigned_from))||Date.parse(p.assigned_at)<Date.parse(config.autoFirstContact.assigned_from))throw Error('自动首联未授权或分配时间早于启用时间');
 let phone=p.recipient_key;
 const guard=()=>{const c=getClient(id);return active()&&!!c&&!c.deleted&&!c.group&&String(c.owner).toLowerCase()===String(config.localOwner).toLowerCase()&&c.name===p.name&&c.country===p.country&&(p.channel==='email'?email(c.email)===p.recipient_key:[p.recipient_key,phone].includes(digits(c.whatsapp)))&&![draft(id,'email'),draft(id,'whatsapp')].some(d=>String(d?.draft||'').trim()||d?.chinesePending);};
 if(!guard())throw Error('客户资料、归属或人工草稿已变化，自动首联未发送');
 const c=getClient(id);
 const receipts=['whatsapp-outbox.json','crm-mail-outbox.json','outlook-graph-outbox.json','outlook-web-outbox.json','mac-mail-outbox.json','winnie-email-outreach.json'].flatMap(name=>read(name,[]));
 if(receipts.some(r=>(r.clientId===id||p.channel==='email'&&email(r.recipient)===p.recipient_key||p.channel==='whatsapp'&&digits(r.jid?.split('@')[0]||r.phone)===p.recipient_key)&&terminal(r)&&!(p.channel==='email'&&r.automaticFirstContact===true&&r.status==='preparing'&&r.messageId&&!r.sendRequestedAt)))return{status:'skipped',detail:'已有联系或待核实发送记录，不重复首联'};
 const history=archive(c)||[];
 if(history.some(m=>m.outgoing===true||/^(?:winnie(?:\s+wu)?(?:\s*\(Email\))?|我方|me)$/i.test(m.speaker||'')))return{status:'skipped',detail:'已有发给客户的历史消息，不重复首联'};
 if(p.channel==='email'){
  if(clients().some(other=>!other.deleted&&other.id!==id&&email(other.email)===email(c.email)))throw Error('邮箱与其他客户重合，自动首联待核对');
  const result=await sendEmail(c,()=>{if(!guard())throw Error('客户或工作区变化，已停止自动首联');});
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
 if(digits(c.whatsapp)!==phone)normalizePhone(id,'+'+phone);
 const result=await sendWhatsApp(c,p.text,guard);
 return{status:result.status,messageId:result.messageId||'',text:p.text,detail:result.detail||''};
}
module.exports={firstContact};
