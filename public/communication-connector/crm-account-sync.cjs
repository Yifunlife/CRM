const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const keys=['name','country','whatsapp','email','grade','nextContact'];
// This worker synchronizes data only. Message commands and their receipts are never retried here.
function createAccountSync({configFile,request,root,state,save,profile,archive,scenes,changed}){
 let timer,current=null,stopped=false,diagnosticRoot='',info={};
 const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file);};
 const failure=(code,message,status=0)=>Object.assign(Error(message),{code,status});
 const location=error=>String(error.stack||'').split('\n').slice(1).map(line=>line.match(/([\w.-]+\.(?:js|cjs|mjs)):(\d+):(\d+)/)?.[0]).filter(Boolean).slice(0,3).join(' | ');
 function load(){
  const workspace=root();if(diagnosticRoot===workspace)return;diagnosticRoot=workspace;
  try{info=read(path.join(workspace,'.workbench','crm-sync-status.json'))||{};}catch{info={};}
  if(info.state==='syncing')log('previous_run_interrupted',null,{previousRunId:info.runId,failedStage:info.stage});
  if(!info.lastSuccess){try{info.lastSuccess=read(path.join(workspace,'.workbench','crm-account-sync.json'))?.updated_at||'';}catch{}}
  info={...info,version:1,state:'idle',stage:'idle',retryAt:0};
 }
 function status(){
  load();const now=Date.now(),last=Date.parse(info.lastSuccess||'');
  return {...info,stale:last?now-last>300000:!!info.lastAttempt&&now-Date.parse(info.lastAttempt)>300000,logFile:path.join(diagnosticRoot,'.workbench','logs','crm-sync.jsonl')};
 }
 function persist(){
  try{write(path.join(diagnosticRoot,'.workbench','crm-sync-status.json'),info);}catch{console.error('CRM sync diagnostic status could not be saved');}
  try{changed?.(status());}catch{}
 }
 function log(event,run,extra={}){
  // Only enumerated metadata is logged; never include payloads, tokens, names, addresses or raw errors.
  const row={at:new Date().toISOString(),event,runId:run?.id,stage:run?.stage,...extra};
  try{const dir=path.join(run?.workspace||diagnosticRoot,'.workbench','logs'),file=path.join(dir,'crm-sync.jsonl');fs.mkdirSync(dir,{recursive:true});if(fs.existsSync(file)&&fs.statSync(file).size>2097152)fs.renameSync(file,file+'.1');fs.appendFileSync(file,JSON.stringify(row)+'\n',{mode:0o600});fs.chmodSync(file,0o600);}catch{console.error('CRM sync diagnostic log could not be saved');}
 }
 function isCurrent(run){return current===run&&!run.cancelled&&!stopped&&root()===run.workspace&&Date.now()<run.deadline;}
 function assertCurrent(run){if(Date.now()>=run.deadline)throw failure('cycle_timeout','整轮同步超时');if(!isCurrent(run))throw failure('cancelled','旧同步轮次已取消');}
 function phase(run,stage){assertCurrent(run);run.stage=stage;info.stage=stage;info.lastProgressAt=new Date().toISOString();persist();log('phase_started',run);}
 function cancel(reason){if(current){current.cancelled=true;current.controller.abort();current.reject(failure(reason,reason==='cycle_timeout'?'整轮同步超时':'同步已取消'));}}
 async function post(run,config,body,stage,desktopId){
  phase(run,stage);const started=Date.now(),controller=new AbortController();let timer;
  const abort=()=>controller.abort();run.controller.signal.addEventListener('abort',abort,{once:true});
  const meta={};if(desktopId&&/^[-a-zA-Z0-9_:]{1,150}$/.test(desktopId))meta.customerRef=crypto.createHash('sha256').update(desktopId).digest('hex').slice(0,16);
  log('request_started',run,meta);
  try{
   const value=await Promise.race([(async()=>{
    const response=await request('https://yifun-crm.yifunlife.workers.dev/api/bridge/poll',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify(body),signal:controller.signal});
    assertCurrent(run);const requestId=response.headers?.get('X-CRM-Request-ID');if(/^[a-f0-9-]{36}$/.test(requestId||''))meta.requestId=requestId;
    meta.httpStatus=response.status||200;
    if(!response.ok)throw Object.assign(failure('http','CRM同步请求失败',response.status),{requestId:meta.requestId});
    return await response.json();
   })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('request_timeout','同步请求超时'));},45000);})]);
   assertCurrent(run);log('request_completed',run,{...meta,durationMs:Date.now()-started});return value;
  }catch(error){log('request_failed',run,{...meta,durationMs:Date.now()-started,code:error.code||'network'});throw error;}
  finally{clearTimeout(timer);run.controller.signal.removeEventListener('abort',abort);}
 }
 function reason(error){
  if(error.code==='request_timeout')return '同步请求超时，将自动重试';
  if(error.code==='cycle_timeout')return '本轮同步超时，将自动恢复';
  if([401,403].includes(error.status))return 'CRM连接授权需核对，请检查连接设置';
  if(error.status)return 'CRM同步服务暂时失败（'+error.status+'），将自动重试';
  if(/账号或工作区不匹配|另一账号|工作区或账号发生变化/.test(error.message||''))return '账号或工作区不匹配，请检查CRM连接';
  return 'CRM同步未完成，将自动重试；详情已记录';
 }
 async function synchronize(run){
   const config=read(configFile);if(!config?.accountSync){info.state='disabled';return;}
   const origin='https://yifun-crm.yifunlife.workers.dev';
   if(!config.enabled||config.origin!==origin||!config.owner_id||!config.token||!config.workspace||fs.realpathSync(root())!==fs.realpathSync(config.workspace))throw Error('账号或工作区不匹配，未同步');
   const workspace=run.workspace,file=path.join(workspace,'.workbench','crm-account-sync.json'),journal=read(file)||{owner_id:config.owner_id,bindings:[],blocked:[]};
   if(journal.owner_id!==config.owner_id)throw Error('此工作台已绑定另一账号，未同步');
   phase(run,'prepare');
   const uploadChats=config.chatUploadMode!=='manual_summary';
   const local=state(),clients=local.clients.filter(c=>!c.deleted&&!c.group&&String(c.owner||'').toLowerCase()===String(config.localOwner).toLowerCase()&&!journal.blocked.includes(c.id));
   if(config.uploadNewLeads===true&&journal.upload_initialized!==true){journal.upload_baseline=local.clients.map(c=>c.id);journal.upload_initialized=true;write(file,journal);}
   const baseline=new Set(journal.upload_baseline||[]),createdHere=new Set(journal.created_leads||[]),reported=config.pullOnly===true?journal.bindings.filter(b=>createdHere.has(b.desktop_id)):journal.bindings;
   const newClients=config.uploadNewLeads===true?clients.filter(c=>!baseline.has(c.id)&&!c.id.startsWith('crm-')&&!journal.bindings.some(b=>b.desktop_id===c.id)).slice(0,20).map(c=>c.id):[];
   const archives=new Map(),readArchive=c=>{if(!archives.has(c.id))archives.set(c.id,archive(c)||[]);return archives.get(c.id);};
   const snapshot=clients.map(c=>({...profile(c),messages:(!uploadChats||config.fullHistory?[]:readArchive(c).slice(-10)).map(m=>({channel:m.channel,timestamp:m.timestamp,speaker:m.speaker,text:String(m.text||'').slice(0,2000),key:m.key||m.whatsappKey||m.emailKey||'',outgoing:/^(?:winnie(?:\s+wu)?(?:\s*\(Email\))?|我方|me)$/i.test(m.speaker||'')}))}));
   let bytes=Buffer.byteLength(JSON.stringify(snapshot.map(c=>({...c,messages:[]}))));
   for(const client of snapshot){const size=Buffer.byteLength(JSON.stringify(client.messages));if(bytes+size>1100000)client.messages=[];else bytes+=size;}
   const result=await post(run,config,{sync:{clients:snapshot,bindings:reported,new_clients:newClients,scenes:scenes(),full_history:uploadChats&&config.fullHistory===true,catalog_only:config.historyOnly===true}},'customers');
   assertCurrent(run);
   if(root()!==workspace||result.owner_id!==config.owner_id)throw Error('工作区或账号发生变化，未写入本地');
   for(const uploaded of result.uploaded||[]){baseline.add(uploaded.desktop_id);if(uploaded.created)createdHere.add(uploaded.desktop_id);}
   const current=state(),bindings=[],conflicts=[...(result.conflicts||[])];let modified=false;
   for(const update of result.updates){
    let c=current.clients.find(c=>c.id===update.desktop_id),before=clients.find(c=>c.id===update.desktop_id),old=config.pullOnly===true&&!createdHere.has(update.desktop_id)?undefined:journal.bindings.find(b=>b.lead_id===update.lead_id),base={};
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
   assertCurrent(run);if(modified)save(current);
   const checkpoint={...journal,owner_id:config.owner_id,upload_baseline:[...baseline],created_leads:[...createdHere],bindings,blocked:[...new Set(result.blocked||[])],conflicts,updated_at:new Date().toISOString()};assertCurrent(run);write(file,checkpoint);
   info.lastSuccess=checkpoint.updated_at;info.customers=snapshot.length;info.conflicts=conflicts.length;persist();log('customers_saved',run,{customers:snapshot.length,conflicts:conflicts.length});
   const historyStarted=Date.now();let historyRequests=0;
   const responseHistory=async history=>{historyRequests++;return post(run,config,{history},'history',history.desktop_id);};
   if(uploadChats&&config.fullHistory)await require('./crm-history-sync.cjs').synchronizeHistory({clients:clients.filter(c=>!checkpoint.blocked.includes(c.id)),archive:readArchive,journal:checkpoint,post:responseHistory,checkpoint:()=>{assertCurrent(run);write(file,checkpoint);},active:()=>isCurrent(run),shouldYield:()=>historyRequests>=8||Date.now()-historyStarted>=15000});
   assertCurrent(run);
   const pending=uploadChats&&config.fullHistory?clients.filter(c=>!checkpoint.blocked.includes(c.id)&&!checkpoint.history?.[c.id]?.complete).length:0;
   info.pendingHistory=pending;
 }
 async function tick(force=false){
  load();if(stopped||current||!force&&(info.retryAt>Date.now()||info.state==='blocked'))return;
  const run={id:crypto.randomUUID(),workspace:root(),stage:'start',deadline:Date.now()+120000,controller:new AbortController(),cancelled:false};
  const interrupted=new Promise((_,reject)=>run.reject=reject);current=run;
  info.runId=run.id;info.state='syncing';info.stage='start';info.lastAttempt=new Date().toISOString();info.retryAt=0;persist();log('cycle_started',run);
  const deadline=setTimeout(()=>cancel('cycle_timeout'),120000);
  try{
   await Promise.race([synchronize(run),interrupted]);assertCurrent(run);
   const recovered=(info.consecutiveFailures||0)>0;info.state=info.state==='disabled'?'disabled':'idle';info.stage='idle';info.lastCompleted=new Date().toISOString();info.error='';info.consecutiveFailures=0;info.retryAt=0;
   log(recovered?'recovered':'cycle_completed',run,{durationMs:Date.now()-Date.parse(info.lastAttempt),pendingHistory:info.pendingHistory||0});
  }catch(error){
   if(error.code==='cancelled'){log('cycle_cancelled',run);info.state='paused';info.stage='idle';}
   else{
    info.consecutiveFailures=(info.consecutiveFailures||0)+1;info.lastFailure=new Date().toISOString();info.error=reason(error);info.errorCode=error.code||'sync_error';info.failedStage=run.stage;
    const blocked=[401,403].includes(error.status)||/不匹配|另一账号|账号发生变化/.test(error.message||'');
    info.state=blocked?'blocked':'retrying';info.retryAt=blocked?0:Date.now()+Math.min(300000,30000*2**Math.min(info.consecutiveFailures-1,4));
    log('cycle_failed',run,{code:info.errorCode,httpStatus:error.status||0,requestId:error.requestId,failures:info.consecutiveFailures,retryAt:info.retryAt,location:location(error)});
   }
  }finally{clearTimeout(deadline);if(current===run){current=null;if(root()===run.workspace)persist();else{diagnosticRoot='';info={};}}}
 }
 function start(){if(timer)clearInterval(timer);stopped=false;void tick(true);timer=setInterval(()=>void tick(),30000);}
 function stop(){stopped=true;clearInterval(timer);timer=null;cancel('cancelled');}
 async function stopAndWait(){stop();while(current)await new Promise(resolve=>setTimeout(resolve,10));}
 async function retry(){await stopAndWait();load();info.state='idle';info.retryAt=0;info.consecutiveFailures=0;start();return status();}
 const error=()=>{const s=status();return s.error||(s.stale?'客资同步已超过5分钟未成功，请检查连接':s.conflicts?'同步有 '+s.conflicts+' 项资料待核对，已保留两端内容':'');};
 return {tick,start,stop,stopAndWait,retry,status,error};
}
module.exports={createAccountSync};
