const fs=require('node:fs'),path=require('node:path');
const keys=['name','country','whatsapp','email','grade','nextContact'];
function createAccountSync({configFile,request,root,state,save,profile,archive,scenes,changed}){
 let timer,busy=false,lastError='',stopped=false;
 const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file);};
 async function tick(){
  if(busy||stopped)return;busy=true;
  try{
   const config=read(configFile);if(!config?.accountSync)return;
   const origin='https://yifun-crm.yifunlife.workers.dev';
   if(!config.enabled||config.origin!==origin||!config.owner_id||!config.token||!config.workspace||fs.realpathSync(root())!==fs.realpathSync(config.workspace))throw Error('账号或工作区不匹配，未同步');
   const workspace=root(),file=path.join(workspace,'.workbench','crm-account-sync.json'),journal=read(file)||{owner_id:config.owner_id,bindings:[],blocked:[]};
   if(journal.owner_id!==config.owner_id)throw Error('此工作台已绑定另一账号，未同步');
   const local=state(),clients=local.clients.filter(c=>!c.deleted&&!c.group&&String(c.owner||'').toLowerCase()===String(config.localOwner).toLowerCase()&&!journal.blocked.includes(c.id));
   const snapshot=clients.map(c=>({...profile(c),messages:(archive(c)||[]).slice(-10).map(m=>({channel:m.channel,timestamp:m.timestamp,speaker:m.speaker,text:String(m.text||'').slice(0,2000),key:m.key||m.whatsappKey||m.emailKey||'',outgoing:/^(?:winnie(?:\s+wu)?(?:\s*\(Email\))?|我方|me)$/i.test(m.speaker||'')}))}));
   let bytes=Buffer.byteLength(JSON.stringify(snapshot.map(c=>({...c,messages:[]}))));
   for(const client of snapshot){const size=Buffer.byteLength(JSON.stringify(client.messages));if(bytes+size>1100000)client.messages=[];else bytes+=size;}
   const response=await request(origin+'/api/bridge/poll',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify({sync:{clients:snapshot,bindings:journal.bindings,scenes:scenes()}}),signal:AbortSignal.timeout(30000)});
   if(!response.ok){let error;try{error=(await response.json()).error;}catch{}throw Error(error||'CRM同步失败（'+response.status+'）');}
   const result=await response.json();
   if(root()!==workspace||result.owner_id!==config.owner_id)throw Error('工作区或账号发生变化，未写入本地');
   const current=state(),bindings=[],conflicts=[...(result.conflicts||[])];let modified=false;
   for(const update of result.updates){
    let c=current.clients.find(c=>c.id===update.desktop_id),before=clients.find(c=>c.id===update.desktop_id),old=journal.bindings.find(b=>b.lead_id===update.lead_id),base={};
    if(c?.deleted){conflicts.push({lead_id:update.lead_id,reason:'本地客户已删除，未重新建立'});continue;}
    if(!c){if(!update.create){conflicts.push({lead_id:update.lead_id,reason:'本地客户已变化'});continue;}c={id:update.desktop_id,...update.values,project:'',stage:1,projectStatus:'交涉中',source:update.source||'CRM',customerType:'',nextAction:'',followStatus:'未安排',closeDate:'',amount:'',owner:config.localOwner,lostReason:'',notes:'',createdAt:new Date().toISOString().slice(0,10),lastContact:'',markdownFile:'',deleted:false,replyGradeRule:false};current.clients.push(c);modified=true;}
    if(String(c.owner||'').toLowerCase()!==String(config.localOwner).toLowerCase()){conflicts.push({lead_id:update.lead_id,reason:'本地归属不匹配'});continue;}
    for(const key of keys){
     const value=String(update.values[key]||''),local=String(c[key]||''),prior=old?.base?.[key];
     const conflict=conflicts.some(x=>x.lead_id===update.lead_id&&(!x.field||x.field===key));
     if(conflict){base[key]=prior??value;continue;}
     if(before&&String(before[key]||'')!==local){base[key]=prior??String(before[key]||'');conflicts.push({lead_id:update.lead_id,field:key,reason:'本地刚被修改，下一轮核对'});continue;}
     if(local===value){base[key]=value;continue;}
     // First association fills empty values; it never replaces a nonempty local value.
     if(prior===undefined&&local){base[key]=value;continue;}
     if(prior!==undefined&&local!==prior){base[key]=prior;continue;}
     c[key]=value;if(key==='grade'){c.gradeAssigned=true;c.replyGradeRule=false;}modified=true;base[key]=value;
    }
    bindings.push({lead_id:update.lead_id,desktop_id:c.id,base});
   }
   if(modified)save(current);
   write(file,{owner_id:config.owner_id,bindings,blocked:[...new Set([...(journal.blocked||[]),...(result.blocked||[])])],conflicts,updated_at:new Date().toISOString()});
   const first=conflicts[0],name=first?current.clients.find(c=>c.id===first.desktop_id)?.name||result.updates.find(u=>u.lead_id===first.lead_id)?.values.name||'客户':'';
   lastError=first?'同步有 '+conflicts.length+' 项待核对：'+name+' · '+first.reason+'。已保留两端内容，请核对后统一。':'';changed?.({customers:snapshot.length,conflicts:conflicts.length,error:lastError});
  }catch(e){lastError=e.message;}finally{busy=false;}
 }
 function start(){stopped=false;void tick();timer=setInterval(tick,30000);}
 function stop(){stopped=true;clearInterval(timer);}
 return {tick,start,stop,error:()=>lastError};
}
module.exports={createAccountSync};
