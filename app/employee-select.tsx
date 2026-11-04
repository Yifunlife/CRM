'use client';
import {useEffect,useState} from 'react';
import {customerOwnerEligible} from '../lib/allocation-intake';
import {can} from '../lib/crm';
import './employee-select.css';
export default function EmployeeSelect({user,api,value,onChange,market,includeFollowup=false}:{market?:string;includeFollowup?:boolean;user:any;api:(path:string)=>Promise<any>;value:string;onChange:(value:string)=>void}){
 const [people,P]=useState<any[]>([]),all=can(user,'customers_all');
 useEffect(()=>{let live=true;if(all)api('users').then(rows=>{if(live)P(rows.filter((p:any)=>p.active&&(['sales','management','ceo'].includes(p.role)||includeFollowup&&customerOwnerEligible(p))));}).catch(()=>{});return()=>{live=false;};},[api,user.id,all,includeFollowup]);
 const visible=people.filter(p=>p.role!=='followup'||customerOwnerEligible(p,['内贸','外贸'].includes(market||'')?market:undefined));
 const rows=visible.some(p=>p.id===user.id)?visible:[user,...visible];
 useEffect(()=>{if(all&&includeFollowup&&value&&people.some(p=>p.id===value&&p.role==='followup'&&!customerOwnerEligible(p,['内贸','外贸'].includes(market||'')?market:undefined)))onChange('');},[all,includeFollowup,value,people,market,onChange]);
 return <label className="confirmed-employee">{includeFollowup?'业务员 / 跟单员':'业务员'}<select aria-label={includeFollowup?'业务员 / 跟单员':'业务员'} value={value} onChange={e=>onChange(e.target.value)}>{all&&<option value="">{includeFollowup?'全部业务员 / 跟单员':'全部业务员'}</option>}{rows.map(p=><option key={p.id} value={p.id}>{p.id===user.id?p.name.replace(/^Winnie Wu$/,'Winnie')+'（我）':p.name}{includeFollowup&&p.role==='followup'?'（跟单员）':''}</option>)}</select></label>;
}
