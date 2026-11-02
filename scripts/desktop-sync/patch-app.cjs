function patchMain(source){

 const anchor='function startCrmBridge(){';if(!source.includes(anchor))throw Error('此工作台版本不支持现有CRM连接，请先提供版本号');
 const helper=`let crmAccountSync;
function crmBridgeOwner(){const c=readJson(path.join(app.getPath('userData'),'crm-bridge.json'),{});if(c.accountSync&&(!c.workspace||path.resolve(c.workspace)!==path.resolve(workspaceRoot)))throw Error('工作区与CRM账号绑定不匹配');return c.accountSync?c.localOwner:'Winnie';}
function startCrmAccountSync(){let snapshot,byClient;
 const state=()=>{const data=bootstrapClients(),clients=data.clients,links=readJson(path.join(workbenchDir(),'customer-email-links.json'),{}),mailView=outlookService().view(),owners=new Map();byClient=new Map();
 for(const row of mailView.messages){const ids=new Set();for(const email of row.folder==='inbox'?[row.from]:row.to||[]){const key=customerArchive.normalizeEmail(email);if(!owners.has(key))owners.set(key,customerArchive.emailOwner(key,clients,links));const client=owners.get(key);if(client)ids.add(client.id);}for(const id of ids){if(!byClient.has(id))byClient.set(id,[]);byClient.get(id).push(row);}}
 snapshot={clients,links,mailView};return data;};
 crmAccountSync=require('./crm-account-sync').createAccountSync({configFile:path.join(app.getPath('userData'),'crm-bridge.json'),request:(...a)=>net.fetch(...a),root:()=>workspaceRoot,state,save:saveClients,profile:require('./crm-client-management').profile,archive:c=>saveCustomerArchive(c,true,{...snapshot,mailRows:byClient.get(c.id)||[]}).messages,scenes:()=>receptionConfig().scenes,changed:value=>sendWhatsAppEvent('crm:synced',value)});crmAccountSync.start();}
`;
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
 if(source.includes(next))return source;
 if(!source.includes(prior)||!source.includes('list.filter(c=>c.grade===grade)'))throw Error('客户分组组件版本不兼容');
 return source.replace(prior,next).replace('list.filter(c=>c.grade===grade)',"list.filter(c=>(c.grade||'未分类')===grade)").replace("new Set(['VIP','A','B','C','whatsapp-groups'])","new Set(['VIP','A','B','C','whatsapp-groups','未分类'])");
}
module.exports={patchMain,patchManagement,patchBridge,patchRenderer};
