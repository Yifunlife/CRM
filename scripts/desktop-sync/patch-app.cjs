function patchMain(source){

 const anchor='function startCrmBridge(){';if(!source.includes(anchor))throw Error('此工作台版本不支持现有CRM连接，请先提供版本号');
 const helper=`let crmAccountSync;
function crmBridgeOwner(){const c=readJson(path.join(app.getPath('userData'),'crm-bridge.json'),{});if(c.accountSync&&(!c.workspace||path.resolve(c.workspace)!==path.resolve(workspaceRoot)))throw Error('工作区与CRM账号绑定不匹配');return c.accountSync?c.localOwner:'Winnie';}
function startCrmAccountSync(){let snapshot,byClient;
 const state=()=>{const data=bootstrapClients(),clients=data.clients,links=readJson(path.join(workbenchDir(),'customer-email-links.json'),{}),mailView=outlookService().view(),owners=new Map();byClient=new Map();
 for(const row of mailView.messages){const ids=new Set();for(const email of row.folder==='inbox'?[row.from]:row.to||[]){const key=customerArchive.normalizeEmail(email);if(!owners.has(key))owners.set(key,customerArchive.emailOwner(key,clients,links));const client=owners.get(key);if(client)ids.add(client.id);}for(const id of ids){if(!byClient.has(id))byClient.set(id,[]);byClient.get(id).push(row);}}
 snapshot={clients,links,mailView};return data;};
 crmAccountSync=require('./crm-account-sync').createAccountSync({configFile:path.join(app.getPath('userData'),'crm-bridge.json'),request:(...a)=>fetch(...a),root:()=>workspaceRoot,state,save:saveClients,profile:require('./crm-client-management').profile,archive:c=>saveCustomerArchive(c,true,{...snapshot,mailRows:byClient.get(c.id)||[]}).messages,scenes:()=>receptionConfig().scenes,changed:value=>sendWhatsAppEvent('crm:synced',value)});crmAccountSync.start();}
`;
 source=source.replace('request:(...args)=>net.fetch(...args),status:', 'request:(...args)=>fetch(...args),status:');
 if(source.includes('createAccountSync')){const begin=source.indexOf('function startCrmAccountSync(){'),end=source.indexOf('\nfunction startCrmBridge()',begin);if(begin<0||end<0)throw Error('已有同步组件无法安全更新');const replacement=helper.slice(helper.indexOf('function startCrmAccountSync(){'));return source.slice(0,begin)+replacement+source.slice(end+1);}
 source=source.replace(anchor,helper+anchor);
 source=source.replaceAll("owner: 'Winnie'","owner: crmBridgeOwner()").replaceAll("owner:'Winnie'","owner:crmBridgeOwner()");
 const start=source.indexOf('let crmBridge,crmLastMailSync=0;'),end=source.indexOf("app.on('before-quit'",start);
 if(start<0||end<0)throw Error('CRM组件位置无法验证，未修改');
 let bridge=source.slice(start,end);
 bridge=bridge.replaceAll(".toLowerCase()!=='winnie'",".toLowerCase()!==crmBridgeOwner().toLowerCase()").replaceAll(".toLowerCase()==='winnie'",".toLowerCase()===crmBridgeOwner().toLowerCase()").replaceAll("owner:'Winnie'","owner:crmBridgeOwner()").replace('management.update(state,changes)','management.update(state,changes,crmBridgeOwner())').replace('crmBridge.start();','crmBridge.start();startCrmAccountSync();').replace('reception:receptionConfig().enabled}),execute','reception:receptionConfig().enabled,error:crmAccountSync?.error()||\'\'}),execute');
 source=source.slice(0,start)+bridge+source.slice(end);
 source=source.replace("speaker:m.speaker,text:String(m.text||'').slice(0,2000)","speaker:m.speaker,outgoing:/^(?:winnie(?:[ ]+wu)?(?:[ ]*[(]Email[)])?|我方|me)$/i.test(m.speaker||''),text:String(m.text||'').slice(0,2000)");
 source=source.replace('crmBridge?.stop();','crmBridge?.stop();crmAccountSync?.stop();');
 return source;
}
function patchManagement(source){
 if(source.includes("function update(state,changes,owner='Winnie')"))return source;
 if(!source.includes('function update(state,changes)'))throw Error('客户编辑组件版本不兼容');
 return source.replace('function update(state,changes)','function update(state,changes,owner=\'Winnie\')').replace("String(c.owner).toLowerCase()==='winnie'","String(c.owner).toLowerCase()===owner.toLowerCase()");
}
function patchBridge(source){if(source.includes("u.origin!=='https://yifun-crm.yifunlife.workers.dev'"))return source;return source.replace("u.origin!=='https://yifun-life-crm.enquiry150941.chatgpt.site'&&","u.origin!=='https://yifun-crm.yifunlife.workers.dev'&&u.origin!=='https://yifun-life-crm.enquiry150941.chatgpt.site'&&");}
function patchRenderer(source){
 const prior="const grades=['VIP','A','B','C','D','Yifun Staff'];",next="const grades=['VIP','A','B','C','D','Yifun Staff','未分类'];";
 if(!source.includes(next)){
  if(!source.includes(prior)||!source.includes('list.filter(c=>c.grade===grade)'))throw Error('客户分组组件版本不兼容');
  source=source.replace(prior,next).replace('list.filter(c=>c.grade===grade)',"list.filter(c=>(c.grade||'未分类')===grade)").replace("new Set(['VIP','A','B','C','whatsapp-groups'])","new Set(['VIP','A','B','C','whatsapp-groups','未分类'])");
 }
 return source.includes('crm-connection-renderer.js')?source:source+"\n(()=>{const script=document.createElement('script');script.src='../crm-connection-renderer.js';document.head.appendChild(script)})();\n";
}
function patchConnectionPreload(source){
 if(!source.includes("exposeInMainWorld('crmConnection'"))source+="\ncontextBridge.exposeInMainWorld('crmConnection',{get:()=>ipcRenderer.invoke('crm:connection-get'),test:payload=>ipcRenderer.invoke('crm:connection-test',payload),save:payload=>ipcRenderer.invoke('crm:connection-save',payload)});\n";
 if(!source.includes("'crm:analysis-start'"))source=source.replace("contextBridge.exposeInMainWorld('crmConnection',{","contextBridge.exposeInMainWorld('crmConnection',{analyze:id=>ipcRenderer.invoke('crm:analysis-start',id),analysisStatus:id=>ipcRenderer.invoke('crm:analysis-status',id),");
 if(source.includes("'crm:sync-status'"))return source;
 return source.replace("contextBridge.exposeInMainWorld('crmConnection',{", "contextBridge.exposeInMainWorld('crmConnection',{status:()=>ipcRenderer.invoke('crm:sync-status'),retry:()=>ipcRenderer.invoke('crm:sync-retry'),openLog:()=>ipcRenderer.invoke('crm:sync-log'),onStatus:callback=>{const listener=(_,value)=>callback(value);ipcRenderer.on('crm:synced',listener);return()=>ipcRenderer.removeListener('crm:synced',listener);},");
}
function patchRecoveryMain(source){
 if(!source.includes("ipcMain.handle('crm:analysis-start'"))source+=`\nconst crmAnalysisButton=require('./crm-analysis-button.cjs').createAnalysisButton({configFile:path.join(app.getPath('userData'),'crm-bridge.json'),root:()=>workspaceRoot,client:crmBridgeClient,request:(...args)=>fetch(...args)});
ipcMain.handle('crm:analysis-start',(_,id)=>crmAnalysisButton.start(id));
ipcMain.handle('crm:analysis-status',(_,id)=>crmAnalysisButton.status(id));\n`;
 if(source.includes("ipcMain.handle('crm:sync-status'"))return source;
 return source+`\nipcMain.handle('crm:sync-status',()=>crmAccountSync?.status()||{state:'disabled',stage:'idle',stale:true});
ipcMain.handle('crm:sync-retry',()=>crmAccountSync?.retry());
ipcMain.handle('crm:sync-log',()=>{const file=path.join(workbenchDir(),'logs','crm-sync.jsonl');if(fs.existsSync(file))shell.showItemInFolder(file);return {ok:fs.existsSync(file)};});
app.whenReady().then(()=>require('electron').powerMonitor.on('resume',()=>{if(!app.isQuitting)void crmAccountSync?.retry();}));\n`;
}

function patchConnectionMain(source){
 const create=source.indexOf("ipcMain.handle('clients:create'");
 if(create>=0){const end=source.indexOf('\n',create),part=source.slice(create,end<0?source.length:end);source=source.replace(part,part.replace("owner:'Winnie'","owner:crmBridgeOwner()"));}
 source=source.replace("owner:'Winnie',lostReason:'',notes:'国家、项目及客户等级请人工确认。'","owner:crmBridgeOwner(),lostReason:'',notes:'国家、项目及客户等级请人工确认。'");
 source=source.replace("require('./crm-connection-settings')","require('./crm-connection-settings.cjs')");
 if(source.includes("require('./crm-connection-settings.cjs')"))return source;
 return source+`\nconst crmConnectionSettings=require('./crm-connection-settings.cjs').createConnectionSettings({configFile:path.join(app.getPath('userData'),'crm-bridge.json'),root:()=>workspaceRoot,clients:()=>bootstrapClients().clients,request:(...args)=>fetch(...args),pause:async()=>{if(crmAccountSync?.stopAndWait)await crmAccountSync.stopAndWait();else crmAccountSync?.stop();},start:()=>{if(!crmBridge)startCrmBridge();else startCrmAccountSync();}});
ipcMain.handle('crm:connection-get',()=>crmConnectionSettings.get());
ipcMain.handle('crm:connection-test',(_,payload)=>crmConnectionSettings.test(payload||{}));
ipcMain.handle('crm:connection-save',(_,payload)=>crmConnectionSettings.save(payload||{}));\n`;
}
function patchFirstContactMain(source){
 if(!source.includes('autoFollowup24h:'))source=source.replace("autoFirstContact:!!readJson(path.join(app.getPath('userData'),'crm-bridge.json'),{}).autoFirstContact,", "autoFirstContact:!!readJson(path.join(app.getPath('userData'),'crm-bridge.json'),{}).autoFirstContact,autoFollowup24h:true,");
 if(!source.includes('refreshFollowup:async()=>'))source=source.replace("active:()=>root===workspaceRoot&&!app.isQuitting,\n   whatsappHistory:", "active:()=>root===workspaceRoot&&!app.isQuitting,\n   refreshFollowup:async()=>{if(!whatsappConnected||!outlookAuth.hasAuthorization())throw Error('请保持WhatsApp和邮件在线，核对回复后再跟进');const synced=await syncOutlook();if(synced?.syncing||synced?.error)throw Error('邮件回复检查尚未完成，未发送');const imported=await importSelectedWhatsAppChats({full:true});if(imported?.busy||imported?.canceled)throw Error('客户回复检查尚未完成，未发送');const response=await fetch(config.origin+'/api/bridge/poll',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify({followup_check:{id:command.id}}),signal:AbortSignal.timeout(20000)});if(!response.ok||!(await response.json()).allowed)throw Error('CRM跟进条件已变化，未发送');},\n   whatsappHistory:");
 source=source.replace("mailSender.send(client,'first',check)","mailSender.send(client,'first',check,{automaticFirstContact:true})");
 source=source.replace("material:()=>reception.approvedFile(receptionConfig(),'company'),guard:","material:()=>{const value=receptionConfig(root);return reception.approvedFile({...value,files:{...value.files,company:'(Compressed)Yifunlife Company Profile.pdf'}},'company')},guard:");
 if(source.includes("require('./crm-first-contact')"))return source;
 const anchor=" const management=require('./crm-client-management');";
 if(!source.includes(anchor))throw Error('此工作台版本不支持自动首联，未修改');
 source=source.replace(anchor,anchor+"\n if(p.auto_first_contact){\n  const config=readJson(path.join(app.getPath('userData'),'crm-bridge.json'),{});\n  const mailSender=createOutlookOutreach({read:(name,fallback)=>readJson(path.join(root,'.workbench',name),fallback),write:(name,value)=>writeJson(path.join(root,'.workbench',name),value),token:()=>backgroundOutlookToken(true),fetch:(...args)=>net.fetch(...args),material:()=>{const value=receptionConfig(root);return reception.approvedFile({...value,files:{...value.files,company:'(Compressed)Yifunlife Company Profile.pdf'}},'company')},guard:()=>root===workspaceRoot&&!app.isQuitting});\n  return require('./crm-first-contact').firstContact({phonePolicy:require('./outreach-policy'),command,config,getClient,clients:()=>bootstrapClients().clients,read:(name,fallback)=>readJson(path.join(root,'.workbench',name),fallback),draft:loadDraft,archive:client=>saveCustomerArchive(client).messages,active:()=>root===workspaceRoot&&!app.isQuitting,\n   whatsappHistory:async phone=>{const jid=phone+'@s.whatsapp.net',names=whatsappContactNames(),aliases=[jid,...(names.aliases.get(jid)||[])].filter(value=>/^\\d+@(s\\.whatsapp\\.net|lid)$/.test(value));return (await readWhatsAppDatabase(\"SELECT id FROM messages WHERE is_from_me=1 AND chat_jid IN (\"+aliases.map(value=>\"'\"+value+\"'\").join(',')+\") LIMIT 1\")).length>0;},\n   normalizePhone:(clientId,phone)=>{const state=bootstrapClients(),client=state.clients.find(c=>c.id===clientId);client.whatsapp=phone;saveClients(state);},\n   sendWhatsApp:(client,text,guard)=>sendReception(client.id,{kind:'lead-welcome',text},{manual:true,requestId:command.id,guard}),sendEmail:(client,check)=>mailSender.send(client,'first',check,{automaticFirstContact:true})});\n }\n\n");
 const status='reception:receptionConfig().enabled,error:crmAccountSync?.error()';
 if(!source.includes(status))throw Error('工作台状态上报版本不兼容，未修改');
 return patchFirstContactMain(source.replace(status,"reception:receptionConfig().enabled,autoFirstContact:!!readJson(path.join(app.getPath('userData'),'crm-bridge.json'),{}).autoFirstContact,error:crmAccountSync?.error()"));
}
function patchFirstContactMail(source){
 source=source.replace("const {approvedFirstMail}=require('./crm-first-contact-mail');","const {approvedFirstMail,sameFirstDraft}=require('./crm-first-contact-mail');");
 source=source.replace("if((await list('drafts',row.recipient)).some(m=>matches(m,row.recipient)&&m.id!==row.messageId))","if(!await sameFirstDraft((await list('drafts',row.recipient)).filter(m=>matches(m,row.recipient)),row.messageId,graph))");
 source=source.replace("if(latestDrafts.some(m=>m.id!==draft.id))","if(row.automaticFirstContact?!await sameFirstDraft(latestDrafts,draft.id,graph):latestDrafts.some(m=>m.id!==draft.id))");
 if(source.includes('async function resumeFirst('))return source;
 source="const {approvedFirstMail,sameFirstDraft}=require('./crm-first-contact-mail');\n"+source;
 source=source.replace("async function send(client,kind,check=async()=>{})", "async function send(client,kind,check=async()=>{},options={})");
 const prior="if(existing)return{status:'skipped',reason:'已有邮件记录：'+existing.status};";
 if(!source.includes(prior))throw Error('首联邮件组件版本不兼容');
 source=source.replace(prior,"if(existing){if(options.automaticFirstContact===true&&existing.automaticFirstContact===true&&existing.status==='preparing'&&!existing.sendRequestedAt)return resumeFirst(existing,client,check);return{status:'skipped',reason:'已有邮件记录：'+existing.status};}");
 source=source.replace("kind,status:'preparing'", "kind,automaticFirstContact:options.automaticFirstContact===true,status:'preparing'");
 source=source.replace("!finalDraft.body.content.includes(signature)||!message.body.split('\\n').filter(Boolean).every(line=>finalDraft.body.content.includes(escape(line)))", "(row.automaticFirstContact?!approvedFirstMail(finalDraft.body.content,row):!finalDraft.body.content.includes(signature)||!message.body.split('\\n').filter(Boolean).every(line=>finalDraft.body.content.includes(escape(line))))");
 const before="if(!row.body||!row.signatureHtml||!row.attachmentSha256||!row.inlineHashes||!row.body.split('\\n').filter(Boolean).every(line=>html.replace(/\\s+/g,' ').includes(escape(line).replace(/\\s+/g,' ')))||!html.includes(row.signatureHtml))";
 const after="if(!row.body||!row.signatureHtml||!row.attachmentSha256||!row.inlineHashes||(row.automaticFirstContact?!approvedFirstMail(html,row):!row.body.split('\\n').filter(Boolean).every(line=>html.replace(/\\s+/g,' ').includes(escape(line).replace(/\\s+/g,' ')))||!row.automaticFirstContact&&!html.includes(row.signatureHtml)))";
 if(!source.includes(before))throw Error('邮件回执校验组件版本不兼容');source=source.replace(before,after);
 source=source.replace("if(latestDrafts.some(m=>m.id!==draft.id))","if(row.automaticFirstContact?!await sameFirstDraft(latestDrafts,draft.id,graph):latestDrafts.some(m=>m.id!==draft.id))");
 return source.replace(' async function send('," async function resumeFirst(row,client,check){\n  if(row.kind!=='first'||row.status!=='preparing'||row.sendRequestedAt||!row.messageId||!row.automaticFirstContact||row.recipient!==emailKey(client.email)||row.body!==contact.firstContact({...client,name:client.emailFirstName||client.name}).body)throw Error('原首联草稿不符合续发条件');\n  const rows=load(),stored=rows.find(r=>r.requestId===row.requestId),route='/me/messages/'+encodeURIComponent(row.messageId);\n  const profile=await graph('/me?$select=mail,userPrincipalName');if(![profile.mail,profile.userPrincipalName].some(x=>emailKey(x)===sender))throw Error('Outlook发件账号不匹配');\n  const source=rows.findLast(x=>x.status==='sent'&&x.signatureVerified&&x.attachmentVerified&&x.messageId);if(!source)throw Error('缺少已批准原签名的成功邮件');\n  const original=await graph('/me/messages/'+encodeURIComponent(source.messageId)+'?$select=body,subject'),originalHtml=original.body?.content||'',start=originalHtml.indexOf('<div id=\"Signature\"');\n  const signature=originalHtml.slice(start).replace(/<\\/body>[\\s\\S]*$/i,'');\n  if(start<0||original.subject!==subject||signature.replace(/ data-outlook-trace=\"[^\"]*\"/g,'')!==row.signatureHtml.replace(/ data-outlook-trace=\"[^\"]*\"/g,''))throw Error('原首联签名已变化，未发送');\n  const file=material();if(!file||path.basename(file.path)!==row.attachment||crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex')!==row.attachmentSha256)throw Error('原首联附件已变化，未发送');\n  await verifyAttachments(row);await check();\n  if((await list('sentitems',row.recipient)).some(m=>matches(m,row.recipient)))throw Error('已发送项已有此客户邮件，不重复发送');\n  if(!await sameFirstDraft((await list('drafts',row.recipient)).filter(m=>matches(m,row.recipient)),row.messageId,graph))throw Error('存在其他人工或历史草稿，未发送');\n  const draft=await graph(route+'?$select=isDraft,body,subject,toRecipients');\n  if(!guard()||!draft.isDraft||draft.subject!==subject||draft.toRecipients?.length!==1||!matches(draft,row.recipient)||!approvedFirstMail(draft.body?.content,row))throw Error('原首联草稿发生实际变化，未发送');\n  await check();stored.status='uncertain';stored.sendRequestedAt=now().toISOString();save(rows);\n  try{\n   await graph(route+'/send','POST');\n   for(let i=0;i<10;i++){const receipt=await graph(route+'?$select=isDraft,sentDateTime,toRecipients,subject,body');if(!receipt.isDraft&&receipt.sentDateTime){await verify(stored,receipt);stored.status='sent';stored.sentAt=receipt.sentDateTime;stored.signatureVerified=true;stored.attachmentVerified=true;save(rows);return stored;}await sleep(1000);}\n   throw Error('Outlook发送结果待核实');\n  }catch(error){stored.detail=error.message;save(rows);throw error;}\n }\n"+' async function send(');
}
module.exports={patchRecoveryMain,patchFirstContactMail,patchFirstContactMain,patchMain,patchManagement,patchBridge,patchRenderer,patchConnectionPreload,patchConnectionMain};
