'use client';
import {useEffect,useState} from 'react';
import './daily-first-contact.css';

export default function DailyFirstContact({api,market,branch,openLead}:{api:(path:string)=>Promise<any>;market:string;branch:string;openLead:(id:string)=>void}){
 const [data,D]=useState<any>(null),[error,E]=useState('');
 useEffect(()=>{let active=true;D(null);E('');const refresh=async()=>{try{const result=await api('role-workspace/daily-first-contact?'+new URLSearchParams({market,branch}));if(active){D(result);E('');}}catch(e:any){if(active)E(e.message);}};void refresh();const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer);};},[market,branch]);
 return <section className="panel daily-first-contact" aria-label="昨日新增客资首联完成情况"><div className="section-heading"><h2>昨日新增客资首联</h2><span className="small muted">{data?.date||'昨天'} · 北京时间</span></div><p className="small muted">查看前一日分配客资的首次联系及结果记录。当天新分配不计入；未完成按自然日累计逾期，补完成保留迟办标记。每分钟自动刷新。</p>
 {error&&<p className="notice error" role="alert">首联完成情况读取失败：{error}</p>}{!data&&!error&&<p role="status">正在核对昨日分配和联系记录…</p>}
 {data&&<><p className="first-contact-summary" role="status">昨日分配 {data.totals.assigned} 位 · 已记录首联 {data.totals.completed} 位 · 尚未完成 {data.totals.incomplete} 位 · 更早逾期 {data.totals.older_overdue} 位</p><div className="table-wrap"><table><thead><tr><th>业务员</th><th>完成提示</th><th>昨日分配</th><th>已完成</th><th>未完成及逾期</th></tr></thead><tbody>{data.people.map((p:any)=><tr key={p.id}><td>{p.name}{(!p.active||p.allocation_state==='请假'||p.allocation_state==='暂停')&&<small>{!p.active?'已停用':p.allocation_state}</small>}</td><td><span className={'first-contact-state '+(p.incomplete?'is-pending':p.late_completed?'is-late':p.assigned?'is-complete':'')}>{p.status}</span>{p.late_completed>0&&<small>{p.late_completed} 位逾期后补完成</small>}</td><td>{p.assigned} 位</td><td>{p.completed} 位</td><td>{p.pending.length?<details><summary>未完成 {p.pending.length} 位 · 最长逾期 {p.max_overdue_days} 天</summary><ul>{p.pending.map((l:any)=><li key={l.id}><button className="text" onClick={()=>openLead(l.id)}>{l.name}</button><span>{l.assigned_date} 分配 · 逾期 {l.overdue_days} 天</span></li>)}</ul></details>:<span className="small muted">无逾期</span>}</td></tr>)}</tbody></table></div>{!data.people.length&&<p className="empty">此范围暂无业务员或新增分配记录。</p>}</>}
 </section>;
}
