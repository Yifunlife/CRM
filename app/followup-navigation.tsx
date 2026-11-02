'use client';
import {useEffect,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {FOLLOWUP_NODES} from '../lib/followup-board';
import './followup-navigation.css';
export default function FollowupNavigation({page,navigate}:{page:string;navigate:(page:string)=>void}){
 const work=['我的待办','交接确认'].includes(page),[open,O]=useState(true);
 useEffect(()=>{if(work)O(true);},[page,work]);
 const link=(key:string,label:string,step?:number)=><button key={key} className={page===key||key==='跟进表'&&['节点跟进表','跟单管理'].includes(page)?'active':''} aria-current={page===key||key==='跟进表'&&['节点跟进表','跟单管理'].includes(page)?'page':undefined} onClick={()=>navigate(key)}>{step!==undefined&&<span className="fn-step" aria-hidden="true">{step}</span>}{label}</button>;
 return <>{link('跟进表','跟进表')}<div className="fn-work"><button className="fn-work-toggle" aria-expanded={open} aria-controls="followup-my-work" onClick={()=>O(v=>!v)}>我的工作<ChevronDown size={14} aria-hidden="true"/></button>{open&&<div className="fn-work-links" id="followup-my-work">{link('我的待办','待办')}{link('交接确认','交接确认')}</div>}</div>{FOLLOWUP_NODES.map((node,i)=>link(node.page,node.label,i+1))}</>;
}
