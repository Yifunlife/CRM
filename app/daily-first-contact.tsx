'use client';
import {useEffect,useState} from 'react';
import {salesStamp} from '../lib/sales-pipeline';
import './daily-first-contact.css';

export default function DailyFirstContact({api,market,branch,openLead,revision=0}:{api:(path:string)=>Promise<any>;market:string;branch:string;openLead:(id:string)=>void;revision?:number}){
 const [data,D]=useState<any>(null),[error,E]=useState('');
 useEffect(()=>{let active=true;D(null);E('');const refresh=async()=>{try{const result=await api('role-workspace/daily-first-contact?'+new URLSearchParams({market,branch}));if(active){D(result);E('');}}catch(e:any){if(active)E(e.message);}};void refresh();const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer);};},[market,branch,revision]);
 const people=data?.people.filter((p:any)=>p.today_assigned||p.assigned||p.overdue)||[];
 function contacts(label:string,leads:any[],tone='',note=''){
  if(!leads.length)return <span className="small muted first-contact-empty"><span className="first-contact-empty-label">{label} </span>0 位</span>;
  return <details><summary className={'first-contact-state '+tone}><span className="first-contact-summary-content"><span>{label} {leads.length} 位</span>{note&&<small>{note}</small>}</span></summary><ul>{leads.map((l:any)=><li key={l.id}><button className="text" onClick={()=>openLead(l.id)}>{l.name}</button><span>{l.assigned_date} 分配 · {l.completed_at?<>{l.message_sent?'已发送信息':'已记录首联'} · {l.contact_method} · {salesStamp(l.completed_at)}{l.late_completion&&' · 逾期后补完成'}</>:l.overdue_days?'已逾期 '+l.overdue_days+' 天':'今日待联系'}</span></li>)}</ul></details>;
 }
 return <section className="panel daily-first-contact" aria-label="新增客资首联提醒"><div className="section-heading"><div><h2>新增客资首联提醒</h2><p className="small muted">今日未联系先提醒，次日起算逾期。已完成统计今日及昨日分配，已逾期包含更早未联系客户；补完成保留迟办标记。每分钟自动刷新。</p></div><span className="small muted">{data?.today||'今天'} · 北京时间</span></div>
 {error&&<p className="notice error" role="alert">首联提醒读取失败：{error}，请点击看板“刷新”重试。</p>}{!data&&!error&&<p role="status">正在核对今日、昨日分配和联系记录…</p>}
 {data&&<><p className="first-contact-summary" role="status">今日分配 {data.totals.today_assigned} 位（待联系 {data.totals.today_incomplete} 位） · 昨日分配 {data.totals.assigned} 位 · 已完成 {data.totals.recent_completed} 位 · 已逾期 {data.totals.overdue} 位</p>{people.length?<div className="table-wrap"><table><thead><tr><th>业务员</th><th>今日分配</th><th>昨日分配</th><th>已完成</th><th>已逾期</th></tr></thead><tbody>{people.map((p:any)=><tr key={p.id}><td>{p.name}{(!p.active||p.allocation_state==='请假'||p.allocation_state==='暂停')&&<small>{!p.active?'已停用':p.allocation_state}</small>}</td><td data-label="今日分配">{contacts('今日分配',p.today_leads,'',p.today_incomplete?'待联系 '+p.today_incomplete+' 位':'')}</td><td data-label="昨日分配">{contacts('昨日分配',p.yesterday_leads,'',p.incomplete?'未完成 '+p.incomplete+' 位':'')}</td><td data-label="已完成">{contacts('已完成',p.completed_leads,'is-complete',p.late_completed?p.late_completed+' 位逾期后补完成':'')}</td><td data-label="已逾期">{contacts('已逾期',p.overdue_leads,'is-pending',p.overdue?'最长逾期 '+p.max_overdue_days+' 天':'')}</td></tr>)}</tbody></table></div>:<p className="small muted">当前范围今日、昨日暂无新增分配，也没有逾期未联系客户。</p>}</>}
 </section>;
}
