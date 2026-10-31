'use client';
import {useEffect,useState} from 'react';
import type {EntryFinding} from '../lib/customer-entry-monitor';
type Rule={number:number;name:string;description:string;count:number};
type Detail={selectedRule:number;rows:EntryFinding[];total:number;page:number;pages:number};
export default function CustomerEntryMonitor({rules,classification,note,revision,api,openItem}:{rules:Rule[];classification:{historical:number;new:number;unknown:number};note:string;revision:string;api:(p:string)=>Promise<any>;openItem:(item:EntryFinding)=>void}){
 const [selected,S]=useState<number|null>(null),[page,P]=useState(1),[data,D]=useState<Detail|null>(null),[busy,B]=useState(false),[error,E]=useState(''),[retry,R]=useState(0);
 useEffect(()=>{
  if(!selected)return;let live=true;B(true);E('');D(null);
  void api('sales-monitor/customer-rules?rule='+selected+'&page='+page).then(d=>{if(live)D(d);}).catch(e=>{if(live)E(e.message||'读取规则明细失败，请重试');}).finally(()=>{if(live)B(false);});
  return()=>{live=false;};
 },[selected,page,revision,api,retry]);
 return <section className="panel customer-entry-monitor" aria-label="客户进入与归属六项监控">
  <h2>客户进入与归属 · 6 项规则</h2>
  <p className="monitor-source">记录分类（含未入档咨询）：历史 {classification.historical} 条 · 新增 {classification.new} 条 · 日期待确认 {classification.unknown} 条</p>
  <div className="entry-rule-list">{rules.map(rule=><button className="entry-rule" type="button" key={rule.number} aria-pressed={selected===rule.number} onClick={()=>{S(rule.number);P(1);}}><span className="entry-rule-text"><strong>{rule.number}. {rule.name}</strong></span><span className="entry-rule-result">{rule.count} 条</span></button>)}</div>
  <details className="monitor-rules"><summary>查看统计口径</summary><p>{note}</p></details>
  {selected&&<div className="entry-rule-detail" aria-busy={busy}>
   <div className="section-heading"><h3>第 {selected} 项：{rules.find(r=>r.number===selected)?.name}</h3><button type="button" onClick={()=>{S(null);D(null);}}>收起明细</button></div>
   <p className="monitor-source">{rules.find(r=>r.number===selected)?.description}</p>
   {busy&&<p role="status">正在读取规则明细…</p>}
   {error&&<p role="alert" className="notice error">{error} <button type="button" onClick={()=>R(v=>v+1)}>重试读取</button></p>}
   {!busy&&!error&&data&&data.selectedRule===selected&&<><p>涉及 {data.total} 条记录</p>{data.rows.map(item=><article key={item.id} className="monitor-item"><div className="monitor-item-main"><div className="monitor-item-heading"><span>{item.level}</span><span>{item.owner_name}</span></div><h3>{item.title}</h3><p>{item.evidence}</p><p className="monitor-suggestion">建议：{item.suggestion}</p></div><button type="button" onClick={()=>openItem(item)}>{item.lead_id?'查看客户':'查看客户管理'}</button></article>)}
    {!data.rows.length&&<p className="monitor-empty">当前可见记录中未发现这项待核查问题。</p>}
    {data.pages>1&&<div className="monitor-pages"><span>第 {data.page} / {data.pages} 页</span><button type="button" disabled={data.page<=1} onClick={()=>P(data.page-1)}>上一页明细</button><button type="button" disabled={data.page>=data.pages} onClick={()=>P(data.page+1)}>下一页明细</button></div>}
   </>}
  </div>}
 </section>;
}
