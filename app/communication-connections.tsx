'use client';
import {useEffect,useRef,useState} from 'react';
import './communication-connections.css';
type Mode='desktop'|'whatsapp';
export default function CommunicationConnections({user,request,current,canSwitch=true,onUse,officialConnect,officialReady=false}:{user:any;request:(path:string,body?:any)=>Promise<any>;current:Mode;canSwitch?:boolean;onUse:(mode:Mode)=>void;officialConnect?:()=>Promise<void>;officialReady?:boolean}){
 const [data,D]=useState<any>(null),[choice,C]=useState<Mode>(current),[busy,B]=useState(false),[error,E]=useState(''),[notice,N]=useState('');
 const secret=useRef(''),working=useRef(false);
 const [code,K]=useState(''),[showCode,SC]=useState(false);
 async function load(){const d=await request('communication/connection');D(d);return d;}
 useEffect(()=>{let active=true;secret.current='';K('');SC(false);request('communication/connection').then(d=>{if(active){D(d);C(d.mode||current);}}).catch(e=>{if(active)E(e.message);});const timer=setInterval(()=>{request('communication/connection').then(d=>{if(active)D(d);}).catch(()=>{});},3000);return()=>{active=false;clearInterval(timer);};},[user.id]);
 async function run(action:()=>Promise<void>){if(working.current)return;working.current=true;B(true);E('');N('');try{await action();}catch(e:any){E(e.message);}finally{working.current=false;B(false);}}
 async function configuration(replace=false){if(!secret.current||replace){const bytes=crypto.getRandomValues(new Uint8Array(48));secret.current=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');}const config=await request('communication/desktop-config',{device_token:secret.current,replace});K(config.token);await load();return config;}
 async function download(replace=false){
  const names=['setup.cjs','crm-account-sync.cjs','crm-history-sync.cjs','crm-connection-settings.cjs','crm-connection-renderer.js','连接我的工作台.command','连接步骤.txt'];
  const assets=await Promise.all(names.map(async name=>{const r=await fetch('/communication-connector/'+encodeURIComponent(name));if(!r.ok)throw Error('连接程序下载失败，请刷新后重试');return [name,new Uint8Array(await r.arrayBuffer())] as const;}));
  const {zipSync,strToU8}=await import('fflate');
  const config=await configuration(replace);
  const files:any={};for(const [name,value] of assets)files['我的工作台连接/'+name]=[value,{os:3,attrs:((name.endsWith('.command')?0o100700:0o100600)<<16)>>>0}];
  files['我的工作台连接/account.json']=[strToU8(JSON.stringify(config,null,2)),{os:3,attrs:(0o100600<<16)>>>0}];
  const blob=new Blob([zipSync(files,{level:6}) as Uint8Array<ArrayBuffer>],{type:'application/zip'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=String(user.username||'本人').replace(/[^a-zA-Z0-9_-]/g,'_')+'-工作台连接.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);await load();N('连接包已下载。在原Mac解压并运行“连接我的工作台.command”，选择原资料文件夹。');
 }
 async function upgrade(){const names=['setup.cjs','crm-account-sync.cjs','crm-history-sync.cjs','crm-connection-settings.cjs','crm-connection-renderer.js','升级连接功能.command','端口接入步骤.txt'],files:any={};for(const name of names){const r=await fetch('/communication-connector/'+encodeURIComponent(name));if(!r.ok)throw Error('升级程序下载失败，请刷新后重试');files['工作台连接升级/'+name]=[new Uint8Array(await r.arrayBuffer()),{os:3,attrs:((name.endsWith('.command')?0o100700:0o100600)<<16)>>>0}];}const {zipSync}=await import('fflate'),url=URL.createObjectURL(new Blob([zipSync(files,{level:6}) as Uint8Array<ArrayBuffer>],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download='工作台CRM连接功能升级.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);N('升级包不含个人连接码。在本人Mac保存并退出工作台后运行升级程序，再填写CRM地址和本人连接码。');}
 const desktop=data?.desktop,wa=data?.whatsapp,active=wa?.active||wa?.official?.active,ready=choice==='desktop'?desktop?.hasArchive:active||!!wa?.phone||!!wa?.official?.display_phone;
 async function enter(){await request('communication/connection',{mode:choice});onUse(choice);}
 return <section className="communication-connections" aria-label="客户沟通连接设置"><header><div><h2>选择接入方式</h2><p>{user.name} · 仅连接本人的客户和聊天记录</p></div><button disabled={busy} onClick={()=>void run(async()=>{await load();})}>刷新状态</button></header>
 <div className="connection-methods" aria-label="接入方式">{[['desktop','已有工作台'],['whatsapp','WhatsApp扫码']].map(([mode,label])=><button key={mode} aria-pressed={choice===mode} onClick={()=>{C(mode as Mode);E('');N('');}}>{label}</button>)}</div>
 {error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status" className="notice success">{notice}</p>}
 {!data?<p role="status">正在检查本人连接…</p>:choice==='desktop'?<div className="connection-content"><h3>{desktop.online?'原工作台已连接':desktop.configured?'原工作台暂未在线':'接入已有工作台'}</h3>{desktop.history.customers>0&&<p role="status">已核对 {desktop.history.completed} / {desktop.history.customers} 位客户 · 云端已保存 {desktop.history.messages.toLocaleString()} 条记录</p>}
 <label>CRM地址<input readOnly value="https://yifun-crm.yifunlife.workers.dev"/></label><p className="connection-status">在工作台「CRM连接」中填写地址和本人连接码。</p>
 {!desktop.configured||secret.current?<button className="primary" disabled={busy} onClick={()=>void run(async()=>{await configuration();N('本人连接码已生成，请复制到本人工作台的“CRM连接”设置。');})}>{secret.current?'显示刚生成的本人连接码':'生成本人连接码'}</button>:<p className="connection-status">本人连接已配置。原工作台的连接码留空即可测试或继续使用原连接。</p>}
 {code&&<div className="connection-code"><label>本人连接码<input readOnly type={showCode?'text':'password'} autoComplete="off" value={code}/></label><div className="connection-actions"><button onClick={()=>SC(!showCode)}>{showCode?'隐藏连接码':'显示连接码'}</button><button onClick={()=>void run(async()=>{await navigator.clipboard.writeText(code);N('本人连接码已复制，请仅在本人工作台使用。');})}>复制本人连接码</button></div></div>}
 <ol><li>在本人工作台点击“CRM连接”。</li><li>填写上方CRM地址、本人连接码，点击“测试连接”核对账号。</li><li>点击“保存并连接”，保持工作台打开和联网。</li></ol>
 <button disabled={busy} onClick={()=>void run(upgrade)}>原工作台没有“CRM连接”？下载升级包</button>
 <details className="connection-replace"><summary>兼容旧连接包方式</summary><button disabled={busy||desktop.configured&&!secret.current} onClick={()=>void run(()=>download())}>下载本人工作台连接包</button></details>
 {desktop.configured&&<details className="connection-replace"><summary>更换连接码</summary><p>生成新码后，原连接码立即失效，需在本人工作台重新填写；已有资料保留。</p><button disabled={busy} onClick={()=>void run(async()=>{await configuration(true);N('新码已生成，请在本人工作台重新填写。');})}>生成新的本人连接码</button></details>}
 </div>:<div className="connection-content"><h3>{active?'本人WhatsApp已连接':'扫码接入本人WhatsApp'}</h3><p role="status">{active?'当前号码：'+(wa.phone||wa.official?.display_phone||'已授权'):wa.serviceOnline?({awaiting_scan:'请用本人手机扫描下方二维码',connecting:'正在连接WhatsApp…',error:'连接失败，可重新生成二维码',disconnected:'已断开，可重新扫码'} as any)[wa.state]||'连接服务已就绪':wa.enabled?'连接服务暂未在线，请稍后刷新':'本人扫码服务尚未启用，请联系管理员'}</p>{wa.error&&<p role="alert" className="notice error">{wa.error}</p>}
 {wa.qr?.length>0&&<div className="linked-qr"><svg role="img" aria-label="本人WhatsApp连接二维码" viewBox={'0 0 '+wa.qr[0].length+' '+wa.qr.length} shapeRendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path fill="black" d={wa.qr.flatMap((row:string,y:number)=>[...row].flatMap((cell,x)=>cell==='1'?['M'+x+' '+y+'h1v1h-1z']:[])).join('')}/></svg></div>}
 <ol><li>点击“生成本人二维码”。</li><li>手机WhatsApp → 设置 → 已关联设备 → 关联设备。</li><li>扫描此页二维码，等待号码确认和文字记录同步。</li></ol>
 <div className="connection-actions"><button className="primary" disabled={busy||active||!wa.serviceOnline} onClick={()=>void run(async()=>{await request('communication/whatsapp-connect',{});await load();N('请用本人手机扫码完成授权。');})}>{wa.qr?.length?'重新生成本人二维码':'生成本人二维码'}</button>{active&&<button disabled={busy} onClick={()=>void run(async()=>{await request(wa.active?'linked/disconnect':'cloud/disconnect',{});await load();N('正在断开本人号码，已同步记录保留。');})}>断开本人WhatsApp</button>}</div>
 {officialConnect&&officialReady&&<details className="connection-replace"><summary>官方平台授权</summary><button disabled={busy||active} onClick={()=>void run(officialConnect)}>连接本人官方WhatsApp</button></details>}
 </div>}
 <footer>{!canSwitch&&choice!==current&&<p>请先处理聊天页中未保存或未发送的内容，再切换接入方式。</p>}<button className="primary" disabled={busy||!ready||!canSwitch&&choice!==current} onClick={()=>void run(enter)}>{choice==='desktop'?'进入工作台聊天':'进入WhatsApp聊天'}</button><span>切换接入方式会保留两边已同步的记录。</span></footer>
 </section>;
}
