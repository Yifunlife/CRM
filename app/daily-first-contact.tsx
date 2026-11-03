'use client';
import {useEffect,useState} from 'react';
import './daily-first-contact.css';

export default function DailyFirstContact({api,market,branch,revision=0}:{api:(path:string)=>Promise<any>;market:string;branch:string;revision?:number}){
 const [data,D]=useState<any>(null),[error,E]=useState('');
 useEffect(()=>{let active=true;D(null);E('');const refresh=async()=>{try{const result=await api('role-workspace/daily-first-contact?'+new URLSearchParams({market,branch}));if(active){D(result);E('');}}catch(e:any){if(active)E(e.message);}};void refresh();const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer);};},[market,branch,revision]);
 const people=data?.people.filter((p:any)=>p.today_assigned||p.assigned||p.overdue)||[];
 function summary(count:number,note='',tone=''){
  return <span className={count?'first-contact-value '+tone:'small muted'}>{count}{note&&<span className="first-contact-note"> / {note}</span>}</span>;
 }
 return <section className="panel daily-first-contact" aria-label="新增客资首联提醒"><div className="section-heading"><div><h2>新增客资首联提醒</h2></div><span className="small muted">{data?.today||'今天'} · 北京时间</span></div>
 {error&&<p className="notice error" role="alert">首联提醒读取失败：{error}，请点击看板“刷新”重试。</p>}{!data&&!error&&<p role="status">正在核对今日、昨日分配和联系记录…</p>}
 {data&&<><p className="first-contact-summary" role="status">今日分配 {data.totals.today_assigned} 位（待联系 {data.totals.today_incomplete} 位） · 昨日分配 {data.totals.assigned} 位 · 已完成 {data.totals.recent_completed} 位 · 已逾期 {data.totals.overdue} 位</p>{people.length?<div className="table-wrap" role="region" aria-label="业务员首联统计，可横向滚动" tabIndex={0}><table><thead><tr><th>业务员</th><th>今日分配</th><th>昨日分配</th><th>已完成</th><th>已逾期</th></tr></thead><tbody>{people.map((p:any)=><tr key={p.id}><td>{p.name}{(!p.active||p.allocation_state==='请假'||p.allocation_state==='暂停')&&<small>{!p.active?'已停用':p.allocation_state}</small>}</td><td data-label="今日分配">{summary(p.today_assigned,p.today_incomplete?'待联系'+p.today_incomplete:'')}</td><td data-label="昨日分配">{summary(p.assigned,p.incomplete?'未完成'+p.incomplete:'')}</td><td data-label="已完成">{summary(p.recent_completed,p.late_completed?'逾期补完成'+p.late_completed:'','is-complete')}</td><td data-label="已逾期">{summary(p.overdue,p.overdue?'最长'+p.max_overdue_days+'天':'','is-pending')}</td></tr>)}</tbody></table></div>:<p className="small muted">当前范围今日、昨日暂无新增分配，也没有逾期未联系客户。</p>}</>}
 </section>;
}
