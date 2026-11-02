const crypto=require('node:crypto');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
async function synchronizeHistory({clients,archive,journal,post,checkpoint,active}){
 journal.history||={};
 for(const client of clients){
  if(!active())throw Error('工作区已变化，聊天同步停止');
  const messages=(archive(client)||[]).map(m=>({...m,text:String(m.text??''),channel:String(m.channel||'whatsapp'),timestamp:String(m.timestamp||[m.date,m.time].filter(Boolean).join(' '))}));
  const occurrences=new Map();
  for(const m of messages){if(!m.key){const digest=hash(JSON.stringify(m)),n=occurrences.get(digest)||0;occurrences.set(digest,n+1);m.key='archive:'+digest+':'+n;}m.outgoing=typeof m.outgoing==='boolean'?m.outgoing:/^(?:winnie(?:\s+wu)?(?:\s*\(Email\))?|我方|me)$/i.test(m.speaker||'');}
  if(new Set(messages.map(m=>m.key)).size!==messages.length)throw Error(client.name+' 的聊天编号重复，请先核对，未标记为完整');
  const revision=hash(JSON.stringify(messages.map(m=>[hash(m.key),hash(JSON.stringify(m))]))),previous=journal.history[client.id];
  if(previous?.revision===revision&&previous.complete)continue;
  let offset=previous?.revision===revision?previous.received:0;
  do{
   if(!active())throw Error('工作区已变化，聊天同步停止');
   const batch=[];let bytes=0;
   for(const m of messages.slice(offset,offset+50)){const entry={value:m,sort_time:Date.parse(m.timestamp)||0},size=Buffer.byteLength(JSON.stringify(entry));if(size>4400000)throw Error(client.name+' 有单条聊天超过上传容量，全文保留本机，未标记为完整');if(batch.length&&bytes+size>700000)break;batch.push(entry);bytes+=size;}
   let result;try{result=await post({desktop_id:client.id,revision,total:messages.length,offset,messages:batch});}catch(e){if(e.status===409){journal.history[client.id]={revision,received:0,complete:false};checkpoint();}throw e;}
   if(!active())throw Error('工作区已变化，未保存新的同步进度');
   if(result.revision!==revision||!Number.isSafeInteger(result.received)||result.received<offset+batch.length||result.received>messages.length)throw Error('云端聊天确认不匹配，未跳过本机记录');
   offset=result.received;journal.history[client.id]={revision,received:offset,total:messages.length,complete:result.complete===true};checkpoint();
  }while(offset<messages.length);
 }
}
module.exports={synchronizeHistory};
