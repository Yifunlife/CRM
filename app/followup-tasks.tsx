'use client';
import EmployeeSelect from './employee-select';
import StatusBadge from './status-badge';
import {useEffect,useState} from 'react';
import {processSummary,FOLLOWUP_NODES} from '../lib/followup-board';
import {suiteStamp} from '../lib/sales-suite';
import FollowupBoard from './followup-board';
import {previewFollowup} from '../lib/crm-preview-data';
import './management-workspace.css';
import './followup-duties.css';
export default function FollowupTasks({user,api,openOrder,orderId,demo=false}:{user:any;api:(path:string,body?:any)=>Promise<any>;openOrder:(id:string)=>void;orderId?:string;demo?:boolean}){
 const [owner,OWNER]=useState(user.id);
 const [data,D]=useState<any>(null),[error,E]=useState(''),[selected,S]=useState(''),[revision,R]=useState(0);
 useEffect(()=>{let live=true;E('');if(demo){D(previewFollowup);return()=>{live=false;};}api('followup').then(d=>{if(live)D(d);}).catch(e=>{if(live)E(e.message);});return()=>{live=false;};},[api,user.id,revision,demo]);
 const orders=(data?.orders||[]).filter((o:any)=>(!orderId||o.id===orderId)&&(!owner||o.commercial_id===owner)&&!o.archived),ids=new Set(orders.map((o:any)=>o.id)),tasks=(data?.tasks||[]).filter((t:any)=>ids.has(t.order_id)&&t.status==='待处理'&&(demo||!owner||t.owner_id===owner));
 const handovers=orders.filter((o:any)=>!['已完成','不适用'].includes(processSummary(o,FOLLOWUP_NODES[0],data.tasks).status));
 if(selected)return <><button className="text back" onClick={()=>{S('');R(r=>r+1);}}>返回我的工作</button><FollowupBoard initialOrderId={selected} initialDemo={demo} initialNode="接单确认" openInitially user={user} api={api}/></>;
 return <div className="management-workspace followup-my-work"><div className="page-heading"><h1>我的待办</h1><EmployeeSelect user={user} api={api} value={owner} onChange={OWNER}/><button onClick={()=>R(r=>r+1)}>刷新</button></div>{demo&&<p className="notice">示例模式 · 以下均为虚拟项目。</p>}{error&&<p className="notice error" role="alert">{error}</p>}{!data&&!error&&<p role="status">正在读取项目事项…</p>}{data&&<>
 <section className="panel" aria-label="待办"><div className="section-heading"><h2>待办</h2><span className="small muted">{tasks.length} 项</span></div><div className="table-wrap"><table className="fm-work-table"><thead><tr>{['项目','待办 / 问题','下一步','截止日期','状态','操作'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{tasks.map((t:any)=>{const order=orders.find((o:any)=>o.id===t.order_id);return <tr key={t.id}><td data-label="项目">{order?.project}<small>{order?.customer_name}</small></td><td data-label="待办 / 问题" className="mw-wrap">{t.title}</td><td data-label="下一步" className="mw-wrap">{t.next_action||'待明确'}</td><td data-label="截止日期">{suiteStamp(t.due_at)}</td><td data-label="状态"><StatusBadge value={Date.parse(t.due_at)<Date.now()?'已逾期':'待处理'}/></td><td data-label="操作"><button onClick={()=>openOrder(t.order_id)}>处理事项</button></td></tr>;})}</tbody></table></div>{!tasks.length&&<p className="mw-empty">当前没有分配给你的未完成事项。</p>}</section>
 <section className="panel" aria-label="交接确认"><div className="section-heading"><h2>交接确认</h2><span className="small muted">{handovers.length} 项</span></div><p className="small muted fd-handover-note">业务正式交接后1个工作日内建档；缺项当天反馈，明确补充人和期限。</p><div className="table-wrap"><table className="fm-work-table"><thead><tr>{['项目 / 客户','业务员 / 跟单员','交接资料','计划日期','接收状态','操作'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{handovers.map((o:any)=>{const state=processSummary(o,FOLLOWUP_NODES[0],data.tasks);return <tr key={o.id}><td data-label="项目 / 客户">{o.project}<small>{o.customer_name}</small></td><td data-label="业务员 / 跟单员">{o.commercial_name}<small>{o.logistics_name}</small></td><td data-label="交接资料" className="mw-wrap">{o.details.handover_gaps||state.next||'待核对合同、清单及图纸'}</td><td data-label="计划日期">{state.due||'交接后1个工作日内'}<small>交接：{suiteStamp(o.details.handover?.submitted_at||o.details.contract_source?.confirmed_at)||'待核实'}</small></td><td data-label="接收状态"><StatusBadge value={state.status}/></td><td data-label="操作"><button onClick={()=>S(o.id)}>核对交接</button></td></tr>;})}</tbody></table></div>{!handovers.length&&<p className="mw-empty">当前没有待确认的项目交接。</p>}</section>
 </>}</div>;
}
