'use client';
import {useState} from 'react';
import {salesStamp} from '../lib/sales-pipeline';
const categories=['客户跟进','项目推进','跟单事项'];
export default function NextStepReminders({rows,openLead,openProject,openOrder}:{rows:any[];openLead:(id:string)=>void;openProject:(id:string)=>void;openOrder:(id:string)=>void}){
 const [page,P]=useState(1),[category,C]=useState('全部');
 const items=rows.filter(r=>category==='全部'||r.category===category),pages=Math.max(1,Math.ceil(items.length/15)),current=Math.min(page,pages);
 const labels:Record<string,string>={customer:'查看客户',project:'查看项目',order:'查看跟单'};
 function open(row:any){if(row.target==='project')openProject(row.target_id);else if(row.target==='order')openOrder(row.target_id);else openLead(row.target_id);}
 return <section className="panel personal-work personal-contact-followup" aria-label="下一步提醒">
  <div className="section-heading"><h2>下一步提醒</h2><span>{categories.map(c=>c+' '+rows.filter(r=>r.category===c).length).join(' · ')}</span></div>
  <div className="next-step-toolbar"><p className="small muted">仅显示需要处理的事项，完成后自动隐藏。原记录保留在客户、项目和跟单中。</p><label><span className="sr-only">提醒类型</span><select aria-label="提醒类型" value={category} onChange={e=>{C(e.target.value);P(1);}}>{['全部',...categories].map(c=><option key={c}>{c}</option>)}</select></label></div>
  <div className="table-wrap"><table><thead><tr><th>客户 / 项目</th><th>事项 / 下一步</th><th>时间 / 提醒</th><th>操作</th></tr></thead><tbody>{items.slice((current-1)*15,current*15).map(r=><tr key={r.id} className={r.rank===0?'personal-todo-late':r.rank===1?'personal-todo-soon':''}><td><strong>{r.name}</strong><small>{r.category}</small></td><td><strong className="personal-contact-action">{r.title}</strong>{r.description&&r.description!==r.title&&<small>{r.description}</small>}</td><td>{r.label}<small>{r.date?(/^\d{4}-\d{2}-\d{2}$/.test(r.date)?r.date:salesStamp(r.date)):'待安排时间'}</small></td><td><button onClick={()=>open(r)} aria-label={r.name+' · '+labels[r.target]}>{labels[r.target]}</button></td></tr>)}</tbody></table></div>
  {!items.length&&<p>当前没有需要处理的{category==='全部'?'事项':category}。</p>}
  {items.length>15&&<div className="personal-pager"><span>共 {items.length} 项 · 第 {current} / {pages} 页</span><button disabled={current===1} onClick={()=>P(current-1)}>上一页</button><button disabled={current===pages} onClick={()=>P(current+1)}>下一页</button></div>}
 </section>;
}
