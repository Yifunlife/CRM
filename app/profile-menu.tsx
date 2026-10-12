'use client';
import {useEffect,useRef,useState} from 'react';
import {UserRound,KeyRound} from 'lucide-react';
export default function ProfileMenu({name,role,navigate}:{name:string;role:string;navigate:(page:string)=>void}){
 const [open,O]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return;
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))O(false);};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){O(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 function choose(page:string){O(false);navigate(page);}
 return <div className="profile-menu" ref={root}><button ref={trigger} className="profile-trigger" aria-label="个人菜单" aria-expanded={open} aria-controls="profile-dropdown" onClick={()=>O(!open)}><span className="avatar">{name.slice(0,1)}</span><span><strong>{name}</strong><span className="small profile-role">{role}</span></span></button>{open&&<div id="profile-dropdown" className="profile-dropdown"><button onClick={()=>choose('个人资料')}><UserRound size={17}/>个人资料</button><button onClick={()=>choose('修改密码')}><KeyRound size={17}/>修改密码</button></div>}</div>;
}
