const fs=require('node:fs'),path=require('node:path');
const origin='https://yifun-crm.yifunlife.workers.dev';
function createConnectionSettings({configFile,root,clients,request,pause,start}){
 const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file);fs.chmodSync(file,0o600);};
 const labels=()=>[...new Set(clients().filter(c=>!c.deleted&&!c.group).map(c=>String(c.owner||'')))];
 function get(){const old=read(configFile),journal=read(path.join(root(),'.workbench','crm-account-sync.json'));return {origin:old.origin||origin,configured:!!old.enabled&&!!old.token,name:old.name||old.localOwner||'',username:old.username||'',workspace:root(),localOwner:old.localOwner||'',owners:labels(),lastSync:journal.updated_at||'',chatUploadMode:old.chatUploadMode||'automatic'};}
 async function identify(input){
  let url;try{url=new URL(String(input.origin||origin));}catch{throw Error('请填写有效的CRM地址');}
  if(url.origin!==origin||url.username||url.password)throw Error('请使用公司的CRM地址：https://yifun-crm.yifunlife.workers.dev');
  const old=read(configFile),token=String(input.token||'').trim()||old.token;
  if(!token)throw Error('请填写本人连接码');
  if(!/^(?:[a-f0-9]{96}|[a-f0-9-]{64,80})$/i.test(token))throw Error('连接码格式不正确，请从本人CRM重新复制');
  const controller=new AbortController();let timer,identity;
  try{identity=await Promise.race([(async()=>{
   const response=await request(origin+'/api/bridge/connect',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}',signal:controller.signal});
   if(!response.ok)throw Error('CRM未接受连接码，请确认从本人CRM账号生成，并检查账号是否启用');
   return response.json();
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('CRM连接核对超时，请检查网络后重试；原连接保留'));},15000);})]);}finally{clearTimeout(timer);}
  if(!identity.owner_id||!identity.username||identity.protocol!==2)throw Error('CRM连接协议不匹配');
  if(old.owner_id&&old.owner_id!==identity.owner_id)throw Error('原工作台已绑定其他CRM账号，未覆盖原连接');
  const journal=read(path.join(root(),'.workbench','crm-account-sync.json'));if(journal.owner_id&&journal.owner_id!==identity.owner_id)throw Error('原资料库属于其他CRM账号，未改动');
  return {identity,token};
 }
 async function test(input){const {identity}=await identify(input);return {...get(),name:identity.name,username:identity.username,can_import:identity.can_import};}
 async function save(input){
  const workspace=root(),{identity,token}=await identify(input);if(!identity.can_import)throw Error('此账号没有客资维护权限，请联系管理员');
  await pause();try{
   if(root()!==workspace)throw Error('资料文件夹已变化，请重新核对连接');
   const old=read(configFile),owners=labels();if(old.owner_id&&old.owner_id!==identity.owner_id)throw Error('原工作台连接刚被修改，请重新核对');let owner=input.localOwner||old.localOwner||(owners.length===1?owners[0]:owners.length?'':identity.name||identity.username);
   if(!owner||owners.some(label=>!label)||owners.length&&!owners.includes(owner))throw Error('请选择原资料中属于本人的负责人标签');
   const journalFile=path.join(workspace,'.workbench','crm-account-sync.json'),journal=read(journalFile);if(journal.owner_id&&journal.owner_id!==identity.owner_id)throw Error('资料归属刚被修改，请重新核对');
   const backup=path.join(workspace,'.workbench','crm-connection-backups',new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(backup,{recursive:true,mode:0o700});
   for(const [name,file]of [['crm-bridge.json',configFile],['crm-account-sync.json',journalFile]])if(fs.existsSync(file)){fs.copyFileSync(file,path.join(backup,name));fs.chmodSync(path.join(backup,name),0o600);}
   if(journal.upload_initialized!==true){journal.owner_id=identity.owner_id;journal.upload_initialized=true;journal.upload_baseline=clients().map(c=>c.id);journal.created_leads=journal.created_leads||[];}
   const next={...old,origin,token,owner_id:identity.owner_id,username:identity.username,name:identity.name,workspace,localOwner:owner,enabled:true,accountSync:true,fullHistory:old.chatUploadMode!=='manual_summary',historyOnly:false,pullOnly:true,uploadNewLeads:true};
   try{write(journalFile,journal);write(configFile,next);}catch(error){for(const [name,file]of [['crm-bridge.json',configFile],['crm-account-sync.json',journalFile]])if(fs.existsSync(path.join(backup,name)))fs.copyFileSync(path.join(backup,name),file);else if(fs.existsSync(file))fs.unlinkSync(file);throw error;}
   return {...get(),connectedAccount:identity.name||identity.username};
  }finally{start();}
 }
 return {get,test,save};
}
module.exports={createConnectionSettings};
