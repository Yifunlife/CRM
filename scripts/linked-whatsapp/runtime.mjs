import {spawn,spawnSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,chmodSync,renameSync,realpathSync,statSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function qrMatrix(output){
 const clean=output.replace(/\x1b\[[0-9;]*[A-Za-z]/g,''),blocks=clean.split(/Scan this QR code with your WhatsApp app:/).slice(1);if(!blocks.length)return [];
 const lines=blocks.at(-1).split(/\r?\n/).filter(line=>/^[ █▀▄]+$/.test(line)&&line.length>=20);if(lines.length<10)return [];
 const width=lines[0].length;if(!/^▀+$/.test(lines.at(-1)))return [];if(lines.some(line=>line.length!==width)||width>200)return [];
 const rows=lines.flatMap(line=>[...['top','bottom'].map(part=>[...line].map(c=>c==='█'||(part==='top'?c==='▀':c==='▄')?'1':'0').join(''))]);
 // The existing CLI draws an inverted QR, including the quiet border.
 if(rows.length!==width+1)return [];const square=rows.slice(0,width);
 return square[0].split('').filter(v=>v==='1').length>width*.9?square.map(row=>[...row].map(c=>c==='1'?'0':'1').join('')):square;
}
export function parseEnvelope(output){
 for(let i=output.indexOf('{');i>=0;i=output.indexOf('{',i+1)){try{const result=JSON.parse(output.slice(i).trim());if(typeof result.success==='boolean'){if(!result.success)throw Error('CLI rejected command');return result.data;}}catch(e){if(e.message==='CLI rejected command')throw e;}}
 throw Error('Missing CLI receipt');
}
export async function startRuntime(configPath){
 const config=JSON.parse(readFileSync(configPath,'utf8')),origin=new URL(config.origin).origin;
 if(!/^https:\/\//.test(origin)||!config.token||!/^[-a-zA-Z0-9]{16,80}$/.test(config.owner_id))throw Error('Invalid isolated runtime configuration');
 if((statSync(configPath).mode&0o077)!==0)throw Error('Runtime configuration must be private (0600)');
 const root=resolve(config.root),store=join(root,config.owner_id),cli=realpathSync(config.cli);
 mkdirSync(store,{recursive:true,mode:0o700});chmodSync(root,0o700);chmodSync(store,0o700);
 // This service must never point at an existing desktop application's session.
 if(/Application Support|workbench-v1\/store|Yifun-V1-macOS-USB\/store/.test(realpathSync(store))||realpathSync(store)!==store||dirname(store)!==root)throw Error('Existing desktop storage is forbidden');
 const stateFile=join(store,'runtime.json'),saved=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{cursor:0,connectedAt:Date.now(),journal:{}};
 const save=()=>{writeFileSync(stateFile+'.tmp',JSON.stringify(saved),{mode:0o600});renameSync(stateFile+'.tmp',stateFile);};
 let state='offline',error='',qr=[],qrExpires=0,phone='',child=null,output='',stopping=false,ticking=false,wantsStop=false,authTimer;
 const sqlite=(file,query)=>{if(!existsSync(file))return [];const r=spawnSync('/usr/bin/sqlite3',['-readonly','-json',file,query],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:10000});if(r.status!==0)throw Error('Cannot read isolated WhatsApp store');return JSON.parse(r.stdout||'[]');};
 const ownPhone=()=>{try{return String(sqlite(join(store,'whatsapp.db'),"SELECT jid FROM whatsmeow_device WHERE jid IS NOT NULL AND jid<>'' LIMIT 1")[0]?.jid||'').split('@')[0].split(':')[0];}catch{return '';}};
 const cliEnv={...process.env};
 if(config.proxy){cliEnv.HTTPS_PROXY=config.proxy;cliEnv.HTTP_PROXY=config.proxy;}
 async function post(body){const response=await fetch(origin+'/api/linked/worker',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('CRM connection rejected ('+response.status+')');return response.json();}
 function launch(kind){
  if(child||wantsStop)return;output='';state=kind==='auth'?'awaiting_scan':'connecting';error='';
  const p=child=spawn(cli,['--store',store,kind],{cwd:store,env:cliEnv,stdio:['ignore','pipe','pipe']});
  const report=chunk=>{output=(output+chunk.toString()).slice(-50000);if(kind==='auth'){const parsed=qrMatrix(output);if(parsed.length&&JSON.stringify(parsed)!==JSON.stringify(qr)){qr=parsed;qrExpires=Date.now()+45000;}}else if(/Connected to WhatsApp|Listening for messages/.test(output)){phone=ownPhone();state=phone?'connected':'error';error=phone?'':'无法确认本人号码，未同步';qr=[];qrExpires=0;}if(/Disconnected|Logged out|logged out|StreamReplaced/i.test(output)){state='offline';error='连接中断，请重新连接或扫码';}};
  p.stdout.on('data',report);p.stderr.on('data',report);
  p.on('error',()=>{state='error';error='无法启动本人连接组件';});
  p.on('close',()=>{if(kind==='auth'){const diagnostic=output.split(/\r?\n/).filter(line=>/error|failed|outdated|timeout|pair/i.test(line)&&!/[█▀▄]/.test(line)).slice(-4).join(' ').replace(/\d{6,}/g,'[redacted]').slice(0,500);if(diagnostic)console.error('Pairing diagnostic: '+diagnostic);}clearTimeout(authTimer);if(child===p)child=null;if(stopping||wantsStop)return;phone=ownPhone();if(kind==='auth'&&phone){qr=[];qrExpires=0;launch('sync');}else{state='offline';qr=[];qrExpires=0;if(kind==='auth')error='扫码已结束，请点击重新连接';}});
  if(kind==='auth')authTimer=setTimeout(()=>p.kill('SIGINT'),120000);
 }
 async function halt(){if(!child)return;stopping=true;const p=child;await new Promise(resolve=>{const timer=setTimeout(()=>p.kill('SIGKILL'),5000);p.once('close',()=>{clearTimeout(timer);resolve();});p.kill('SIGINT');});child=null;stopping=false;clearTimeout(authTimer);}
 async function syncMessages(){
  if(state!=='connected')return;const rows=sqlite(join(store,'messages.db'),`SELECT rowid AS cursor,id,chat_jid,content,timestamp,is_from_me FROM messages WHERE rowid>${Number(saved.cursor)||0} ORDER BY rowid LIMIT 100`);if(!rows.length)return;
  const lids=new Map(sqlite(join(store,'whatsapp.db'),'SELECT lid,pn FROM whatsmeow_lid_map').map(r=>[String(r.lid),String(r.pn)]));
  const messages=rows.filter(r=>/^\d+@(s\.whatsapp\.net|lid)$/.test(r.chat_jid)).flatMap(r=>{const [number,type]=r.chat_jid.split('@'),peer=type==='lid'?lids.get(number):number,at=new Date(r.timestamp);if(!peer||!Number.isFinite(at.getTime()))return [];return [{id:peer+':'+r.id,peer,direction:r.is_from_me?'out':'in',content:r.content,created:at.toISOString(),history:at.getTime()<saved.connectedAt}];});
  if(messages.length)await post({messages});saved.cursor=rows.at(-1).cursor;save();
 }
 async function execute(command){
  const previous=saved.journal[command.id];if(previous){await post({result:{id:command.id,...(previous.state==='running'?{state:'uncertain',error:'执行记录待核实，未重复发送'}:previous)}});return;}
  await halt();saved.journal[command.id]={state:'running'};save();let result;
  try{
   if(!/^\d{8,15}$/.test(command.peer)||!command.content)throw Error('Invalid recipient');
   const data=await new Promise((resolve,reject)=>{let out='',err='';const p=spawn(cli,['--store',store,'send','--to',command.peer+'@s.whatsapp.net','--message',command.content],{cwd:store,env:cliEnv,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('Unknown send outcome'));},45000);p.stdout.on('data',c=>out+=c);p.stderr.on('data',c=>err+=c);p.on('error',()=>{clearTimeout(timer);reject(Error('Send process failed'));});p.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw Error('Unknown send outcome');resolve(parseEnvelope(out||err));}catch(e){reject(e);}});});
   if(data.sent!==true||!data.id||data.recipient!==command.peer+'@s.whatsapp.net')throw Error('Missing send receipt');
   result={state:'sent',message_id:command.peer+':'+data.id,peer:command.peer};
  }catch{result={state:'uncertain',error:'发送结果待核对，不会自动重发'};}
  saved.journal[command.id]=result;save();await post({result:{id:command.id,...result}});launch('sync');
 }
 async function tick(){
  if(ticking||wantsStop)return;ticking=true;
  try{
   const next=await post({state,phone,qr:qrExpires>Date.now()?qr:[],qr_expires:qrExpires,error});
   if(next.desired==='reconnect'){await halt();qr=[];qrExpires=0;state='offline';await post({state,phone:'',qr:[],ack:'reconnect'});return;}
   if(next.desired==='disconnect'){await halt();saved.paused=true;save();state='disconnected';qr=[];qrExpires=0;await post({state,phone,qr:[]});return;}
   if(next.desired==='connect'&&!child){saved.paused=false;phone=ownPhone();if(!phone)saved.connectedAt=Date.now();save();launch(phone?'sync':'auth');}
   if(next.command)await execute(next.command);else await syncMessages();
  }catch(e){console.error(new Date().toISOString(),String(e.message).slice(0,180));}
  finally{ticking=false;}
 }
 phone=ownPhone();if(phone&&!saved.paused)launch('sync');if(saved.paused)state='disconnected';const timer=setInterval(tick,2000);await tick();
 const stop=async()=>{wantsStop=true;clearInterval(timer);await halt();try{await post({state:'offline',phone,qr:[]});}catch{}process.exit(0);};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 console.log('Isolated WhatsApp service ready for owner '+config.owner_id+'; no automatic messages.');
 return {stop};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){await startRuntime(process.argv[2]);}
