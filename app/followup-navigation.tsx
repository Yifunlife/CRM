'use client';
import {FOLLOWUP_NODES} from '../lib/followup-board';
import './followup-navigation.css';
export default function FollowupNavigation({page,navigate}:{page:string;navigate:(page:string)=>void}){
 const link=(key:string,label:string)=>{const current=page===key||key==='跟进表'&&['节点跟进表','跟单管理'].includes(page)||key==='跟单我的工作'&&['我的待办','交接确认'].includes(page);return <button key={key} className={current?'active':''} aria-current={current?'page':undefined} onClick={()=>navigate(key)}>{label}</button>;};
 return <>{link('跟进表','跟进表')}{link('跟单我的工作','我的工作')}{FOLLOWUP_NODES.map(node=>link(node.page,node.label))}</>;
}
