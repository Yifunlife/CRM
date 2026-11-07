import {useEffect,useRef,useState} from 'react';
import {crmLocation,readCRMLocation,type CRMRoute} from '../lib/crm-location';

export default function useCRMLocation(scope:string,route:CRMRoute,restore:(route:CRMRoute)=>Promise<void>,canLeave:()=>boolean,blocked:()=>void){
 const current=useRef({route,restore,canLeave,blocked});current.current={route,restore,canLeave,blocked};
 const restoring=useRef(false),last=useRef(''),[ready,READY]=useState(''),[revision,R]=useState(0);
 useEffect(()=>{if(!scope)return;let live=true;restoring.current=true;last.current='';const saved=readCRMLocation(window.location.hash,scope);
  (async()=>{try{if(saved)await current.current.restore(saved);}finally{if(live){restoring.current=false;last.current=saved?window.location.hash:'';READY(scope);R(n=>n+1);}}})();
  return()=>{live=false;};
 },[scope]);
 useEffect(()=>{if(!scope||ready!==scope||restoring.current)return;const hash=crmLocation(scope,route);if(hash===last.current)return;
  const previous=last.current;window.history[previous?'pushState':'replaceState']({crmPrevious:previous},'',window.location.pathname+window.location.search+hash);last.current=hash;
 },[scope,ready,revision,route.page,route.lead,route.tab,route.project,route.market,route.demo,route.order,route.suite,route.dossierProject]);
 useEffect(()=>{if(!scope)return;const pop=async()=>{const saved=readCRMLocation(window.location.hash,scope);if(!saved)return;if(!current.current.canLeave()){window.history.pushState({},'',window.location.pathname+window.location.search+last.current);current.current.blocked();return;}restoring.current=true;try{await current.current.restore(saved);last.current=window.location.hash;}finally{restoring.current=false;R(n=>n+1);}};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[scope]);
 return (fallback:()=>void)=>{if(!current.current.canLeave()){current.current.blocked();return;}if(readCRMLocation(window.history.state?.crmPrevious||'',scope))window.history.back();else fallback();};
}
