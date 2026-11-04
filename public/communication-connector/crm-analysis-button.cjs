const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function createAnalysisButton({configFile,root,client,request}){
 const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file);};
 const pending=row=>row&&['preparing','queued','running'].includes(row.state);
 function context(id){const workspace=root(),c=client(id),config=read(configFile);if(!c||c.deleted||c.group||!config.enabled||config.workspace!==workspace||String(c.owner).toLowerCase()!==String(config.localOwner).toLowerCase())throw Error('客户或CRM归属需要核对');return{workspace,config,file:path.join(workspace,'.workbench','customer-analysis-requests.json')};}
 async function post(ctx,body){
  const controller=new AbortController();let timer;
  try{const result=await Promise.race([(async()=>{const r=await request('https://yifun-crm.yifunlife.workers.dev/api/bridge/poll',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+ctx.config.token},body:JSON.stringify(body),signal:controller.signal});if(!r.ok)throw Error('CRM暂未接受操作，请核对客户关联和连接状态后重试');return r.json();})(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('CRM连接暂未确认，请稍后重试；同一整理请求不会重复提交'));},15000);})]);
   if(root()!==ctx.workspace)throw Error('工作区已变化，原请求已保留');return result;
  }finally{clearTimeout(timer);}
 }
 function audit(ctx,row,event){try{const file=path.join(ctx.workspace,'.workbench','logs','crm-analysis.jsonl');fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file)&&fs.statSync(file).size>2097152)fs.renameSync(file,file+'.1');fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),event,requestId:row.requestId,jobId:row.jobId,state:row.state})+'\n',{mode:0o600});}catch{}}
 async function start(id){
  const ctx=context(id),rows=read(ctx.file);let row=rows[id];
  if(!pending(row)){row={...(row?.analysis?{analysis:row.analysis,syncedAt:row.syncedAt}:{}),requestId:crypto.randomUUID(),state:'preparing',startedAt:new Date().toISOString()};rows[id]=row;write(ctx.file,rows);audit(ctx,row,'requested');}
  try{const result=await post(ctx,{analysis_request:{desktop_id:id,request_id:row.requestId}});Object.assign(row,{jobId:result.id,state:result.state,error:''});write(ctx.file,rows);audit(ctx,row,'accepted');return row;}
  catch(error){row.error=error.message;write(ctx.file,rows);audit(ctx,row,'request_pending');throw error;}
 }
 async function status(id){
  const ctx=context(id),rows=read(ctx.file),row=rows[id];if(!row)return null;
  if(!row.jobId)return row;
  if(!pending(row))return row;
  const result=await post(ctx,{analysis_status:{desktop_id:id,job_id:row.jobId}});
  Object.assign(row,{state:result.state,error:result.error||(result.state==='uncertain'?'上次整理被中断，原分析保留；可重新整理。':'')});if(result.state==='done'){row.analysis=result.analysis;row.syncedAt=result.synced_at;}write(ctx.file,rows);if(!pending(row))audit(ctx,row,'completed');return row;
 }
 return {start,status};
}
module.exports={createAnalysisButton};
