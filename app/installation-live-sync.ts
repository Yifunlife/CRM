'use client';
import {useEffect,useRef} from 'react';

const changeKey='crm-installation-change',changeEvent='crm-installation-change';
export function installationChanged(){
 window.dispatchEvent(new Event(changeEvent));
 try{window.localStorage.setItem(changeKey,Date.now()+':'+Math.random());}catch{}
}
export function installationSaveError(error:any){
 if(error.status===409||/安装安排已被其他人更新/.test(error.message||'')){
  installationChanged();
  return '此项目已在其他页面更新，你的修改已保留。请取消当前修改，系统会自动同步最新资料。';
 }
 return error.message;
}

// Signals carry no business data. Every reader reloads through its own authorized API.
export function useInstallationSync(scope:string,blocked:boolean,refresh:(current:()=>boolean)=>Promise<void>){
 const latest=useRef({blocked,refresh}),flush=useRef(()=>{}),queued=useRef(false);
 latest.current={blocked,refresh};
 useEffect(()=>{
  if(!scope){queued.current=false;return;}
  let active=true,running=false,pending=queued.current,version=0;
  queued.current=false;
  function run(){
   if(!active||!pending||running||latest.current.blocked)return;
   pending=false;running=true;const requested=version;
   const current=()=>{
    if(!active)return false;
    if(latest.current.blocked||requested!==version){pending=true;return false;}
    return true;
   };
   void latest.current.refresh(current).catch(()=>{}).finally(()=>{running=false;if(pending)run();});
  }
  function changed(){version++;pending=true;run();}
  const storage=(event:StorageEvent)=>{if(event.key===changeKey)changed();};
  const visible=()=>{if(document.visibilityState==='visible')changed();};
  flush.current=run;run();
  window.addEventListener(changeEvent,changed);window.addEventListener('storage',storage);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  const timer=window.setInterval(visible,15000);
  return()=>{active=false;queued.current=pending||running;flush.current=()=>{};window.clearInterval(timer);window.removeEventListener(changeEvent,changed);window.removeEventListener('storage',storage);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[scope]);
 useEffect(()=>{if(!blocked)flush.current();},[blocked,scope]);
}
