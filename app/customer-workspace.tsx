'use client';
import CustomerCommunication from './customer-communication';
import VisitReceptionPage from './visit-reception';
import EmployeeSelect from './employee-select';
import {useEffect,useState} from 'react';
import {PROJECT_STAGES,suiteStamp} from '../lib/sales-suite';
import {InquiryTime,InquiryContent} from './customer-inquiry';
import StatusBadge from './status-badge';
import CustomerSummary from './customer-summary';
import CustomerManagement from './customer-management';
import {readWorkspaceContext,writeWorkspaceContext,workspaceContextKey} from './workspace-context';
import './management-workspace.css';
type Props={initialVisitId?:string;onVisitChange?:(id:string)=>void;initialLeadId?:string;section?:string;onSection?:(section:string)=>void;user:any;api:(path:string,body?:any)=>Promise<any>;onEditingChange?:(editing:boolean)=>void;openLead:(id:string,tab?:string)=>void};
export default function CustomerWorkspace({user,api,openLead,section='总况',onSection,initialLeadId,initialVisitId,onVisitChange,onEditingChange}:Props){
 const contextKey=workspaceContextKey(user)+':customer-workspace';
 const [saved]=useState(()=>readWorkspaceContext(contextKey));
 const tab=section;const [data,D]=useState<any>(null),[page,P]=useState(saved.page||1),[query,Q]=useState(saved.query||''),[revision,R]=useState(0),[error,E]=useState(''),[owner,O]=useState(saved.owner??(user.role==='operations'?'':user.id)),[state,STATE]=useState(saved.state||''),[market,MK]=useState(saved.market||'全部');
 useEffect(()=>{writeWorkspaceContext(contextKey,{page,query,owner,state,market});},[contextKey,page,query,owner,state,market]);
 useEffect(()=>{if(tab==='档案'||tab==='会议到访')return;let live=true;E('');const timer=setTimeout(()=>api('sales-management/customers?'+new URLSearchParams(tab==='总况'?{summary:'1'}:{page:String(page),q:query,owner,state,market})).then(d=>{if(live)D(d);}).catch(e=>{if(live)E(e.message);}),query?200:0);return()=>{live=false;clearTimeout(timer);};},[api,page,query,owner,state,revision,user.id,tab,market]);
 if(tab==='会议到访')return <VisitReceptionPage user={user} api={api} openLead={openLead} initialVisitId={initialVisitId} onVisitChange={onVisitChange} onEditingChange={onEditingChange}/>;
 if(tab==='档案')return <div className="management-workspace"><CustomerManagement onEditingChange={onEditingChange} initialLeadId={initialLeadId} initialMarket={market} initialOwner={owner} initialStatus={state} onOwnerChange={O} title="客户档案" user={user} api={api} openLead={openLead}/></div>;
 const stages=Object.fromEntries(PROJECT_STAGES);
 return <div className={'management-workspace'+(tab==='会议到访'?' mw-meetings':tab==='推进'?' mw-progress':'')}><div className="page-heading"><div><h1>{tab==='会议到访'?'到访记录':tab==='推进'?'客户跟进':'客户'+tab}</h1></div>{tab!=='总况'&&<EmployeeSelect user={user} api={api} value={owner} onChange={value=>{O(value);P(1);}}/>}<button onClick={()=>R(r=>r+1)}>刷新</button></div>
 {error&&<p className="notice error" role="alert">{error}</p>}{tab==='档案'?<CustomerManagement user={user} api={api} openLead={openLead}/>:<>{!data&&!error&&<p role="status">正在读取客户记录…</p>}{data&&<>
 {tab==='总况'&&<CustomerSummary data={data} open={(section,nextOwner,state='',nextMarket='全部')=>{O(nextOwner??'');Q('');STATE(state);MK(nextMarket);P(1);onSection?.(section);}}/>}
 {tab==='推进'&&<section className="panel"><h2>客户跟进</h2><div className="mw-filterbar"><label className="mw-search">搜索客户<input type="search" value={query} onChange={e=>{Q(e.target.value);P(1);}} placeholder="客户名称或国家"/></label><label>客户状态<select value={state} onChange={e=>{STATE(e.target.value);P(1);}}><option value="">全部状态</option>{['待首次联系','已联系待回复','正在沟通','暂停跟进','已成交','已结束'].map(t=><option key={t}>{t}</option>)}</select></label><label>客资市场<select value={market} onChange={e=>{MK(e.target.value);P(1);}}>{['全部','内贸','外贸','待确认'].map(m=><option key={m}>{m}</option>)}</select></label></div><div className="table-wrap mw-progress-scroll" tabIndex={0} role="region" aria-label="客户跟进表，可横向和纵向滚动"><table><thead><tr><th scope="col">客户 / 负责人</th><th>原始咨询 / 渠道</th><th>当前阶段</th><th>业务员首次联系</th><th>会议 / 到访</th><th>最近沟通 / 卡点</th><th>下一步 / 跟进日期</th><th>操作</th></tr></thead><tbody>{data.rows.map((c:any)=><tr key={c.id}><td><button className="text" onClick={()=>openLead(c.id)}>{c.name}</button><small>{c.owner_name||'待分配'}</small></td><td className="mw-original-inquiry"><InquiryTime inquiry={c.original_inquiry}/><small>{c.original_inquiry?.platform||'待确认'} / {c.original_inquiry?.account||'待确认'}</small><InquiryContent inquiry={c.original_inquiry}/></td><td className="mw-current-stage"><StatusBadge value={c.project_stage?stages[c.project_stage]||c.project_stage:c.status}/>{c.project_count>0&&<small>{c.project_count} 个项目 · 最近项目阶段</small>}</td><td>{c.first_contact?suiteStamp(c.first_contact):'待补记录'}</td><td>线上：{c.meeting_date||'无登记'}<small>到访：{c.visit_date||'无登记'}</small></td><td className="mw-wrap"><CustomerCommunication key={c.id+':'+c.last_note_at+':'+c.manual_blocker} customer={c} api={api} openLead={openLead}/></td><td className="mw-wrap mw-next-step"><span className="mw-next-excerpt">{c.next_step||'待安排'}</span><small>{c.next_date||'日期待安排'}</small></td><td><button onClick={()=>openLead(c.id,'跟进')}>记录跟进</button></td></tr>)}</tbody></table></div><div className="pagination"><span>共 {data.total} 位客户 · 第 {page} 页</span><div><button disabled={page<=1} onClick={()=>P(page-1)}>上一页</button><button disabled={page*30>=data.total} onClick={()=>P(page+1)}>下一页</button></div></div></section>}

 </>}</>}
 </div>;
}
