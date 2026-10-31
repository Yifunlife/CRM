'use client';
import {useState} from 'react';
import {reportPeriod,ReportPeriodKind} from '../lib/report-period';
export function useReportPeriod(){
 const [month,M]=useState(()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}).slice(0,7));
 const [kind,K]=useState<ReportPeriodKind>('month'),[year,Y]=useState(month.slice(0,4)),[quarter,Q]=useState(String(Math.ceil(Number(month.slice(5,7))/3)));
 const [start,S]=useState(month+'-01'),[end,E]=useState(()=>{const range=reportPeriod(new URLSearchParams({month}),month);return new Date(Date.parse(range.end+'T00:00:00Z')-86400000).toISOString().slice(0,10);});
 const setStart=(day:string)=>{if(!day)return;S(day);if(day>end)E(day);};
 const setEnd=(day:string)=>{if(!day)return;E(day);if(day<start)S(day);};
 const params=new URLSearchParams({period:kind,month,year,quarter,start,end});
 const range=reportPeriod(params,month);
 return {kind,month,year,quarter,start,end,setStart,setEnd,query:params.toString(),range,setKind:K,setMonth:M,setYear:Y,setQuarter:Q};
}
export default function ReportPeriodPicker({period:p}:{period:ReturnType<typeof useReportPeriod>}){
 return <><label>统计周期<select value={p.kind} onChange={e=>p.setKind(e.target.value as ReportPeriodKind)}><option value="month">月</option><option value="quarter">季</option><option value="year">年</option><option value="custom">自定义区间</option></select></label>{p.kind==='custom'?<><label>开始日期<input type="date" min="2000-01-01" max="9998-12-31" value={p.start} onChange={e=>p.setStart(e.target.value)}/></label><label>结束日期<input type="date" min="2000-01-01" max="9998-12-31" value={p.end} onChange={e=>p.setEnd(e.target.value)}/></label></>:p.kind==='month'?<label>统计月份<input type="month" min="2000-01" max="9998-12" value={p.month} onChange={e=>{if(e.target.value)p.setMonth(e.target.value);}}/></label>:<><label>统计年份<select value={p.year} onChange={e=>p.setYear(e.target.value)}>{Array.from({length:Math.max(101,Number(p.year)-2000+1)},(_,i)=>2000+i).map(y=><option key={y}>{y}</option>)}</select></label>{p.kind==='quarter'&&<label>统计季度<select value={p.quarter} onChange={e=>p.setQuarter(e.target.value)}>{[1,2,3,4].map(q=><option key={q} value={q}>第{q}季度</option>)}</select></label>}</>}</>;
}
