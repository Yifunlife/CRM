'use client';
import {useState} from 'react';
import {salesStamp} from '../lib/sales-pipeline';

export default function ContactFollowup({rows,openLead}:{rows:any[];openLead:(id:string)=>void}){
 const [page,P]=useState(1);
 const active=rows.filter(r=>r.kind!=='dormant');
 const pages=Math.max(1,Math.ceil(active.length/15)),current=Math.min(page,pages);
 const labels:Record<string,string>={alternate:'24 小时未回复',waiting:'等待客户回复',review:'联系情况待核对',first:'待首次联系'};
 function table(items:any[]){return <div className="table-wrap"><table><thead><tr><th>客户</th><th>现在该做什么</th><th>联系进度 / 提醒时间</th><th>操作</th></tr></thead><tbody>{items.map(r=><tr key={r.id} className={r.kind==='alternate'?'personal-todo-soon':''}><td><strong>{r.name}</strong><small>首选{r.preferred==='email'?'邮件':r.preferred==='whatsapp'?' WhatsApp':'方式待确认'}</small></td><td><span className="badge">{labels[r.kind]}</span><strong className="personal-contact-action">{r.title}</strong><small>{r.reason}</small></td><td>{r.whatsapp_at&&<div>WhatsApp：{salesStamp(r.whatsapp_at)}</div>}{r.email_at&&<div>邮件：{salesStamp(r.email_at)}</div>}{!r.first_at&&<div>首次成功联系时间待核对</div>}{r.due_at&&<small>{r.alternate&&!r[r.alternate+'_at']?'满 24 小时':'满 7 天'}：{salesStamp(r.due_at)}</small>}</td><td><button onClick={()=>openLead(r.id)} aria-label={r.name+' · '+(r.kind==='review'?'查看并核对':'查看并联系')}>{r.kind==='waiting'?'查看沟通记录':r.kind==='review'?'查看并核对':'查看并联系'}</button></td></tr>)}</tbody></table></div>;}
 return <section className="panel personal-work personal-contact-followup" aria-label="下一步联系提醒"><div className="section-heading"><h2>下一步联系提醒</h2><span>需联系 {active.filter(r=>['alternate','first'].includes(r.kind)).length} · 等待 {active.filter(r=>r.kind==='waiting').length} · 待核对 {active.filter(r=>r.kind==='review').length}</span></div><p className="small muted">按客户首选方式联系；满 24 小时仍未回复，改用第二种方式。这里只显示当前需要处理的联系事项。</p>{table(active.slice((current-1)*15,current*15))}{!active.length&&<p>暂无需要换渠道或核对联系情况的客户。</p>}{active.length>15&&<div className="personal-pager"><span>共 {active.length} 位客户 · 第 {current} / {pages} 页</span><button disabled={current===1} onClick={()=>P(current-1)}>上一页</button><button disabled={current===pages} onClick={()=>P(current+1)}>下一页</button></div>}<p className="small muted">依据已确认的发送记录和客户回复判断；客户主动回复或再次咨询后转入正常跟进。未满提醒时间不计逾期。</p></section>;
}
