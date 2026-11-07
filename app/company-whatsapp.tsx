'use client';
import {useEffect,useState} from 'react';

type Props={request:(path:string,body?:any)=>Promise<any>;readOnly:boolean};
export default function CompanyWhatsApp({request,readOnly}:Props){
 const [status,S]=useState<any>(null),[start,START]=useState<any>(null),[busy,B]=useState(false),[error,E]=useState(''),[notice,N]=useState('');
 const load=async()=>{const data=await request('cloud/company-status');S(data);return data;};
 useEffect(()=>{let active=true;const read=()=>request('cloud/company-status').then(data=>{if(active)S(data);}).catch(e=>{if(active)E(e.message);});void read();const timer=setInterval(read,10000);return()=>{active=false;clearInterval(timer);};},[request]);
 const run=async(fn:()=>Promise<void>)=>{B(true);E('');N('');try{await fn();}catch(e:any){E(e.message);}finally{B(false);}};
 async function prepare(){
  if(!(window as any).FB)await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='https://connect.facebook.net/en_US/sdk.js';script.onload=()=>resolve();script.onerror=()=>reject(Error('Meta授权页面加载失败，请重试'));document.head.appendChild(script);});
  const auth=await request('cloud/connect/start',{});(window as any).FB.init({appId:auth.appId,version:'v26.0',xfbml:false});START({...auth,created:Date.now()});
 }
 async function connect(){
  if(!start||Date.now()-start.created>540000){await prepare();N('授权入口已准备好，请点击“继续 Meta 授权”');return;}
  await new Promise<void>((resolve,reject)=>{
   let ids:any=null,code='',finished=false;
   const cleanup=()=>{window.removeEventListener('message',listen);clearTimeout(timer);};
   const finish=async()=>{if(finished||!ids||!code)return;finished=true;cleanup();try{await request('cloud/connect/finish',{nonce:start.nonce,code,phone_id:ids.phone_number_id,waba_id:ids.waba_id});START(null);await load();N('公司号码已授权；请向该号码发送一条测试询盘，验证入库与分配');resolve();}catch(e){START(null);reject(e);}};
   const cancel=(message:string)=>{finished=true;cleanup();START(null);reject(Error(message));};
   const listen=(event:MessageEvent)=>{
    if(!['https://www.facebook.com','https://web.facebook.com'].includes(event.origin))return;
    let data:any;try{data=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
    if(data?.type!=='WA_EMBEDDED_SIGNUP')return;
    if(['FINISH','FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(data.event)){ids=data.data;void finish();}
    else if(['CANCEL','ERROR'].includes(data.event))cancel('Meta授权未完成，请重新连接');
   };
   const timer=setTimeout(()=>cancel('授权超时，请重新连接'),300000);window.addEventListener('message',listen);
   (window as any).FB.login((response:any)=>{code=response.authResponse?.code||'';if(!code)cancel('未完成Meta登录授权');else void finish();},{config_id:start.configId,response_type:'code',override_default_response_type:true,extras:{setup:{},featureType:'whatsapp_business_app_onboarding',sessionInfoVersion:'3'}});
  });
 }
 const connected=!!status?.connection?.active;
 return <section className="panel service-company-cloud" aria-label="公司 WhatsApp 官方接入">
  <div className="section-heading"><h2>公司 WhatsApp 官方接入</h2><button disabled={busy} onClick={()=>run(async()=>{await load();})}>刷新接入状态</button></div>
  <p role="status">{!status?'正在读取接入状态…':connected?'已授权 · '+status.connection.display_phone:status.metaReady?'待授权公司号码':'待配置公司 Meta 应用'}</p>


  <p className="small muted">附件原件请在公司 WhatsApp 查看。</p>
  {connected&&<p>{status.connection.last_received?'最近收到消息：'+new Date(status.connection.last_received).toLocaleString('zh-CN',{timeZone:'Australia/Sydney'})+'（悉尼）':'尚未收到真实消息，请完成测试询盘验证。'}</p>}
  {!readOnly&&status&&!status.metaReady&&<p>请在本页下方的“公司平台设置”中配置 Meta 应用，并在 Meta 后台订阅消息通知。</p>}
  {!readOnly&&status?.linkedConflict&&<p>请先在下方断开本账号的扫码客服连接，再授权官方接口。</p>}
  {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice success" role="status">{notice}</p>}
  {!readOnly&&<div className="service-actions"><button className="primary" disabled={busy||!status?.metaReady||status?.linkedConflict||connected} onClick={()=>run(connect)}>{busy?'正在处理…':start?'继续 Meta 授权':'授权公司接待号码'}</button>{connected&&<button disabled={busy} onClick={()=>run(async()=>{await request('cloud/disconnect',{});START(null);await load();N('已停止此号码的新消息接入，现有客户和记录保留');})}>停止官方接入</button>}</div>}
 </section>;
}
