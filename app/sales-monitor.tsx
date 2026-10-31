'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import type {MonitorItem} from '../lib/sales-monitor';
import './sales-monitor.css';
import CustomerEntryMonitor from './customer-entry-monitor';
import {groupMonitorItems} from '../lib/sales-monitor-groups';
type Report={customerRules:{number:number;name:string;description:string;count:number}[];customerClassification:{historical:number;new:number;unknown:number};customerRuleNote:string;at:string;scope:string;items:MonitorItem[];people:{id:string;name:string}[];summary:{customers:number;projects:number;orders:number;exceptions:number};sources:{quote:string;daily:string;reminderRule:string};team:{id:string;name:string;items:number;exceptions:number}[]};
const stamp=(s:string)=>s?new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'尚无记录';
export default function SalesMonitor({api,openItem}:{api:(p:string)=>Promise<Report>;openItem:(item:MonitorItem)=>void}){
 const [data,D]=useState<Report|null>(null),[error,E]=useState(''),[busy,B]=useState(false),[level,L]=useState('全部'),[stage,S]=useState('全部'),[owner,O]=useState('全部'),[query,Q]=useState(''),[page,P]=useState(1),[selectedGroup,SG]=useState<string|null>(null);
 const load=useCallback(async()=>{B(true);E('');try{D(await api('sales-monitor'));}catch(e:any){E(e.message||'监控数据读取失败，请重试');}finally{B(false);}},[api]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>P(1),[level,stage,owner,query,selectedGroup]);
 const rows=useMemo(()=>data?.items.filter(i=>(level==='全部'||i.level===level)&&(stage==='全部'||i.stage===stage)&&(owner==='全部'||i.owner_id===owner)&&(!query||[i.title,i.evidence,i.owner_name].join(' ').toLowerCase().includes(query.toLowerCase())))||[],[data,level,stage,owner,query]);
 const groups=useMemo(()=>groupMonitorItems(rows),[rows]),activeGroup=groups.find(g=>g.id===selectedGroup),detailRows=activeGroup?.items||[];
 const pages=Math.max(1,Math.ceil(detailRows.length/30)),current=Math.min(page,pages);
 return <section className="sales-monitor" aria-busy={busy}>
  <div className="page-heading"><div><h1>智能监控</h1><p>查看流程卡点、记录依据与责任人，进入原业务页面处理。</p></div><button disabled={busy} onClick={()=>void load()}>{busy?'正在读取…':'刷新监控'}</button></div>
  {error&&<p className="notice error" role="alert">{error} <button disabled={busy} onClick={()=>void load()}>重新读取</button></p>}
  {!data&&!error&&<p role="status">正在读取客户、项目、报价和订单记录…</p>}
  {data&&<><p className="monitor-updated">{data.scope} · 数据读取于北京时间 {stamp(data.at)}{error?' · 当前显示上一次成功读取的结果':''}</p>
   <div className="monitor-overview" aria-label="当前监控范围"><span>销售项目 <strong>{data.summary.projects}</strong></span><span>执行中订单 <strong>{data.summary.orders}</strong></span><span>新增待首次联系 <strong>{data.summary.customers}</strong></span><span>其他异常事项 <strong>{data.summary.exceptions}</strong></span></div>
   <div className="monitor-source"><span>到期检查：每天北京时间 08:00</span><span>最近检查：{stamp(data.sources.daily)}</span><span>报价来源：{data.sources.quote}</span></div>
   {data.sources.quote!=='已连接'&&<p role="status" className="notice">报价来源{data.sources.quote}，待接收报价可能未完整显示。请核查来源连接后刷新。</p>}
   <CustomerEntryMonitor rules={data.customerRules} classification={data.customerClassification} note={data.customerRuleNote} revision={data.at} api={api} openItem={openItem}/>
   <section className="panel"><div className="section-heading"><h2>其他问题分类 <span className="monitor-count">{groups.length} 类</span></h2></div>
    <details className="monitor-filter-box"><summary>筛选统计范围{level!=='全部'||stage!=='全部'||owner!=='全部'||query?'（已筛选）':''}</summary><div className="monitor-filters"><label>处理类型<select value={level} onChange={e=>L(e.target.value)}>{['全部','异常','待确认','到期提醒','待处理','历史对齐'].map(v=><option key={v}>{v}</option>)}</select></label><label>流程环节<select value={stage} onChange={e=>S(e.target.value)}>{['全部','客户','项目','报价','合同','跟单','连接'].map(v=><option key={v}>{v}</option>)}</select></label>{data.scope==='全团队'&&<label>负责人<select value={owner} onChange={e=>O(e.target.value)}><option value="全部">全部</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}<label>搜索事项<input type="search" value={query} onChange={e=>Q(e.target.value)} placeholder="项目、客户或负责人"/></label></div></details>
    <div className="entry-rule-list">{groups.map(group=><button className="entry-rule" type="button" key={group.id} aria-pressed={selectedGroup===group.id} aria-expanded={selectedGroup===group.id} onClick={()=>SG(group.id)}><span className="entry-rule-text"><strong>{group.name}</strong></span><span className="entry-rule-result">{group.count} 项</span></button>)}</div>
    {!groups.length&&<p className="monitor-empty">{data.items.length?'当前筛选下没有事项，可调整筛选条件。':'当前没有其他待处理事项。'}</p>}
    {activeGroup&&<div className="monitor-group-detail"><div className="section-heading"><h3>{activeGroup.name}</h3><button type="button" onClick={()=>SG(null)}>收起明细</button></div><p className="monitor-source">涉及 {activeGroup.count} 项，按 {detailRows.length} 条明细记录展示。</p>
    {detailRows.slice((current-1)*30,current*30).map(item=><article key={item.id} className="monitor-item"><div className="monitor-item-main"><div className="monitor-item-heading"><span className={item.level==='异常'?'monitor-exception':''}>{item.level}</span><span>{item.stage} · {item.owner_name}</span></div><h3>{item.title}{item.count>1&&<span className="monitor-count"> · {item.count} 条</span>}</h3><p>{item.evidence}</p><p className="monitor-suggestion">建议：{item.suggestion}</p></div><button onClick={()=>openItem(item)}>去处理</button></article>)}
    {pages>1&&<div className="monitor-pages"><span>第 {current} / {pages} 页，共 {detailRows.length} 条明细</span><button disabled={current<=1} onClick={()=>P(current-1)}>上一页</button><button disabled={current>=pages} onClick={()=>P(current+1)}>下一页</button></div>}
    </div>}
   </section>
   {data.team.length>0&&<section className="panel"><h2>团队处理分布</h2><div className="monitor-team">{data.team.map(p=><button key={p.id} aria-pressed={owner===p.id} onClick={()=>O(owner===p.id?'全部':p.id)}><span>{p.name}</span><span>{p.items} 项待核查 · {p.exceptions} 项异常</span></button>)}</div></section>}
   <details className="monitor-rules"><summary>监控依据与处理规则</summary><ul><li>以已保存的业务记录识别事项；异常标记表示需要核查，不代表已证实业务失误。</li><li>业务保存或确认后立即同步；刷新监控只读取结果，不重新生成到期通知。</li><li>到期提醒来自已生成的站内通知，每天北京时间 08:00 检查；8点后到期的事项在下次检查处理。</li><li>历史客资归属待对齐单独列示，不计新增分配、待首次联系或首次联系逾期。</li><li>报价接收、合同和跟单负责人确认、付款及 CEO 特殊放行在原页面办理。</li></ul></details>
  </>}
 </section>;
}
