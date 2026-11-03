'use client';
import {useEffect,useState} from 'react';
import {can} from '../lib/crm';
import './employee-select.css';
export default function EmployeeSelect({user,api,value,onChange}:{user:any;api:(path:string)=>Promise<any>;value:string;onChange:(value:string)=>void}){
 const [people,P]=useState<any[]>([]),all=can(user,'customers_all');
 useEffect(()=>{let live=true;if(all)api('users').then(rows=>{if(live)P(rows.filter((p:any)=>p.active&&['sales','management','ceo'].includes(p.role)));}).catch(()=>{});return()=>{live=false;};},[api,user.id,all]);
 const rows=people.some(p=>p.id===user.id)?people:[user,...people];
 return <label className="confirmed-employee">业务员<select aria-label="业务员" value={value} onChange={e=>onChange(e.target.value)}>{all&&<option value="">全部业务员</option>}{rows.map(p=><option key={p.id} value={p.id}>{p.id===user.id?p.name.replace(/^Winnie Wu$/,'Winnie')+'（我）':p.name}</option>)}</select></label>;
}
