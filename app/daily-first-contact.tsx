'use client';
import {useEffect,useState} from 'react';
import './daily-first-contact.css';

export default function DailyFirstContact({api,market,branch,revision=0}:{api:(path:string)=>Promise<any>;market:string;branch:string;revision?:number}){
 const [data,D]=useState<any>(null),[error,E]=useState('');
 useEffect(()=>{let active=true;D(null);E('');const refresh=async()=>{try{const result=await api('role-workspace/daily-first-contact?'+new URLSearchParams({market,branch}));if(active){D(result);E('');}}catch(e:any){if(active)E(e.message);}};void refresh();const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer);};},[market,branch,revision]);
 const people=data?.people.filter((p:any)=>p.today_assigned||p.assigned||p.overdue)||[];
 const maxOverdueDays=Math.max(0,...people.map((p:any)=>p.max_overdue_days));
 function summary(count:number,note='',tone=''){
  return <span className={count?'first-contact-value '+tone:'small muted'}>{count}{note&&<span className="first-contact-note"> / {note}</span>}</span>;
 }
 return <section className="panel daily-first-contact" aria-label="新增客资首联提醒"><div className="section-heading"><div><h2>新增客资首联提醒</h2></div><span className="small muted">{data?.today||'今天'} · 北京时间</span></div>
 {error&&<p className="notice error" role="alert">首联提醒读取失败：{error}，请点击看板“刷新”重试。</p>}{!data&&!error&&<p role="status">正在核对今日、昨日分配和联系记录…</p>}
 {data&&<>{people.length?<div className="table-wrap" role="region" aria-label="业务员首联统计，可横向滚动" tabIndex={0}><table><thead><tr><th>业务员</th><th>今日分配</th><th>昨天总分配</th><th>昨日已完成</th><th>昨日逾期</th><th>总逾期 / 最长天数</th></tr></thead><tbody>{people.map((p:any)=><tr key={p.id}><td>{p.name}{(!p.active||p.allocation_state==='请假'||p.allocation_state==='暂停')&&<small>{!p.active?'已停用':p.allocation_state}</small>}</td><td data-label="今日分配">{summary(p.today_assigned,p.today_incomplete?'待联系'+p.today_incomplete:'')}</td><td data-label="昨天总分配">{summary(p.assigned)}</td><td data-label="昨日已完成">{summary(p.completed,p.late_completed?'逾期补完成'+p.late_completed:'','is-complete')}</td><td data-label="昨日逾期">{summary(p.incomplete,'','is-pending')}</td><td data-label="总逾期 / 最长天数">{summary(p.overdue,p.max_overdue_days+'天','is-pending')}</td></tr>)}</tbody><tfoot><tr><th scope="row">合计</th><td>{summary(data.totals.today_assigned,data.totals.today_incomplete?'待联系'+data.totals.today_incomplete:'')}</td><td>{summary(data.totals.assigned)}</td><td>{summary(data.totals.completed,'','is-complete')}</td><td>{summary(data.totals.incomplete,'','is-pending')}</td><td>{summary(data.totals.overdue,maxOverdueDays+'天','is-pending')}</td></tr></tfoot></table></div>:<p className="small muted">当前范围今日、昨日暂无新增分配，也没有逾期未联系客户。</p>}</>}
 </section>;
}
