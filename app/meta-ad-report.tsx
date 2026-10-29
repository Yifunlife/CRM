'use client';
import {useEffect,useState} from 'react';
import {metaPeriod,metaPeriodRows,metaResultLabel,metaTotals,type MetaAdMetric,type MetaPeriod} from '../lib/meta-ad-report';
import './meta-ad-report.css';
import MetaAdTrend from './meta-ad-trend';
const money=(n:number)=>new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
const number=(n:number)=>new Intl.NumberFormat('zh-CN').format(n);
export default function MetaAdReport(){
 const [data,D]=useState<any>(null),[error,E]=useState(''),[period,P]=useState<MetaPeriod>('month'),[account,A]=useState(''),[year,Y]=useState(''),[selected,S]=useState(''),[metric,SM]=useState('actions:leadgen.other');
 async function load(){E('');try{const r=await fetch('/api/advertising/meta'),d:any=await r.json();if(!r.ok)throw new Error(d.error||'读取失败');D(d);}catch(e:any){E(e.message);}}
 useEffect(()=>{load();},[]);
 if(error)return <section className="panel"><h2>Meta 历史投放分析</h2><p role="alert">{error}</p><button onClick={load}>重新读取</button></section>;
 if(!data)return <section className="panel"><h2>Meta 历史投放分析</h2><p role="status">正在读取历史投放…</p></section>;
 if(!data.accounts.length)return <section className="panel"><h2>Meta 历史投放分析</h2><p className="muted">尚未导入 Meta 历史报表。</p></section>;
 const accounts=data.accounts.filter((a:any)=>!account||a.id===account),daily:MetaAdMetric[]=data.daily;
 const years=[...new Set(daily.map(r=>r.date.slice(0,4)))].sort().reverse(),periods=metaPeriodRows(daily,period,account,year);
 const matches=(r:MetaAdMetric)=>(!account||r.account_id===account)&&(!year||r.date.startsWith(year))&&(!selected||metaPeriod(r.date,period)===selected);
 const rows=daily.filter(matches),total=metaTotals(rows),shownPeriods=periods.filter(r=>!selected||r.period===selected);
 const campaigns=new Map<string,{name:string;account:string;rows:MetaAdMetric[]}>();
 for(const r of data.campaigns.filter(matches)){const key=r.account_id+':'+r.campaign_id;const group=campaigns.get(key)||{name:r.campaign_name||'原报表未提供广告系列',account:r.account_id,rows:[] as MetaAdMetric[]};group.rows.push(r);campaigns.set(key,group);}
 const ranked=[...campaigns.values()].map(g=>({...g,...metaTotals(g.rows)})).sort((a,b)=>b.spent-a.spent);
 const resultTypes=[...new Set([...shownPeriods.flatMap(r=>Object.keys(r.results)),...ranked.flatMap(r=>Object.keys(r.results))])].sort((a,b)=>metaResultLabel(a).localeCompare(metaResultLabel(b),'zh-CN'));
 const resultCells=(results:Record<string,number>)=>resultTypes.map(t=><td key={t}>{Object.hasOwn(results,t)?number(results[t]):'—'}</td>);
 const resultHeaders=resultTypes.map(t=><th scope="col" key={t}>{metaResultLabel(t)}</th>);
 return <section className="panel meta-ad-report" aria-label="Meta 历史投放分析"><h2>Meta 历史投放分析</h2>
  <p className="muted">全案、玩具和模拟区分别核算，合计以美元（USD）显示。费用按 Meta 账户报表日期归属。</p>
  <div className="meta-ad-filters"><div><span className="small">查看方式</span><div className="tabs" aria-label="投放统计周期">{([['month','按月'],['quarter','按季'],['year','按年']] as const).map(([value,label])=><button key={value} aria-pressed={period===value} className={period===value?'selected':''} onClick={()=>{P(value);S('');}}>{label}</button>)}</div></div>
   <label>业务 / 账户<select value={account} onChange={e=>{A(e.target.value);S('');}}><option value="">两个账户合计</option>{data.accounts.map((a:any)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <label>年份<select value={year} onChange={e=>{Y(e.target.value);S('');}}><option value="">全部年份</option>{years.map(y=><option key={y}>{y}</option>)}</select></label>
   <label>统计期间<select value={selected} onChange={e=>S(e.target.value)}><option value="">全部期间</option>{periods.map(r=><option key={r.period}>{r.period}</option>)}</select></label>
  </div>
  <div className="meta-chart-heading"><h3>{period==='month'?'每月':period==='quarter'?'季度':'年度'}对比图</h3><label>成效指标<select value={metric} onChange={e=>SM(e.target.value)}>{[...new Set(['actions:leadgen.other',metric,...resultTypes])].map(t=><option key={t} value={t}>{metaResultLabel(t)}</option>)}</select></label></div>
  <MetaAdTrend metricLabel={metaResultLabel(metric)} rows={shownPeriods.map(r=>{const outcomes=(data.outcomes||[]).filter((v:any)=>(!account||v.account_id===account)&&metaPeriod(v.date,period)===r.period);return {period:r.period,spent:r.spent,leads:r.results[metric]??null,customers:outcomes.length?outcomes.reduce((n:number,v:any)=>n+v.customers,0):null,deals:outcomes.length?outcomes.reduce((n:number,v:any)=>n+v.deals,0):null};})} coverage={typeof data.outcomeCoverage==='string'?data.outcomeCoverage:data.outcomeCoverage?.reason}/>
  <p className="small muted">按时间从早到晚对比；金额与成效分图。未提供的成效不作零值。当前月份为截至报表日期的累计。</p>
  <details><summary>查看费用明细</summary><h3>费用与效果明细</h3><p aria-live="polite">{selected||year||'全部已导入历史'} · {account?accounts[0]?.name:'两个账户'}实际花费 <strong>{money(total.spent)} USD</strong></p>
  {shownPeriods.length?<div className="table-wrap"><table><caption className="sr-only">按所选周期和账户统计的实际广告费用，单位美元</caption><thead><tr><th scope="col">期间</th>{accounts.map((a:any)=><th scope="col" key={a.id}>{a.name}（USD）</th>)}<th scope="col">展示次数</th><th scope="col">链接点击</th>{accounts.length>1&&<th scope="col">合计（USD）</th>}</tr></thead><tbody>{shownPeriods.map(r=><tr key={r.period}><th scope="row">{r.period}</th>{accounts.map((a:any)=><td key={a.id}>{money(metaTotals(rows.filter(v=>v.account_id===a.id&&metaPeriod(v.date,period)===r.period)).spent)}</td>)}<td>{number(r.impressions)}</td><td>{number(r.clicks)}</td>{accounts.length>1&&<td><strong>{money(r.spent)}</strong></td>}</tr>)}</tbody><tfoot><tr><th scope="row">所选范围合计</th>{accounts.map((a:any)=><td key={a.id}>{money(metaTotals(rows.filter(r=>r.account_id===a.id)).spent)}</td>)}<td>{number(total.impressions)}</td><td>{number(total.clicks)}</td>{accounts.length>1&&<td><strong>{money(total.spent)}</strong></td>}</tr></tfoot></table></div>:<p className="muted">所选范围暂无已导入数据。</p>}
  </details><details><summary>查看各类成效明细</summary><h3>Meta 成效明细</h3><p className="small muted">各类成效单独列示；“—”表示该期间未提供此类型记录，不代表零。</p>{resultTypes.length>0?<div className="table-wrap"><table><thead><tr><th scope="col">期间</th>{resultHeaders}</tr></thead><tbody>{shownPeriods.map(r=><tr key={r.period}><th scope="row">{r.period}</th>{resultCells(r.results)}</tr>)}</tbody><tfoot><tr><th scope="row">所选范围合计</th>{resultCells(total.results)}</tr></tfoot></table></div>:<p className="muted">所选范围暂无成效数据。</p>}
  {resultTypes.length>0&&<details><summary>按账户查看成效</summary><div className="table-wrap"><table><thead><tr><th scope="col">账户</th>{resultHeaders}</tr></thead><tbody>{accounts.map((a:any)=><tr key={a.id}><th scope="row">{a.name}</th>{resultCells(metaTotals(rows.filter(r=>r.account_id===a.id)).results)}</tr>)}</tbody></table></div></details>}
  </details><details><summary>查看账户投放效率</summary><h3>所选范围投放效果</h3><div className="table-wrap"><table><thead><tr>{['账户','展示次数','链接点击','点击率','单次点击费用（USD）','千次展示费用（USD）'].map(v=><th scope="col" key={v}>{v}</th>)}</tr></thead><tbody>{[...accounts.map((a:any)=>({name:a.name,...metaTotals(rows.filter(r=>r.account_id===a.id))})),...(accounts.length>1?[{name:'合计',...total}]:[])].map(r=><tr key={r.name}><th scope="row">{r.name}</th><td>{number(r.impressions)}</td><td>{number(r.clicks)}</td><td>{r.impressions?`${(r.clicks/r.impressions*100).toFixed(2)}%`:'—'}</td><td>{r.clicks?money(r.spent/r.clicks):'—'}</td><td>{r.impressions?money(r.spent/r.impressions*1000):'—'}</td></tr>)}</tbody></table></div>
  <p className="small muted">成效按类型分别统计，不等同于 CRM 有效客户或成交人数。触达人数、频次保留在原始明细中，不跨日累加；单次点击费用和千次展示费用按所选范围重新计算。未关联成交数据，暂不计算投产比。</p>
  </details><details><summary>广告系列花费排行（前 20 项，共 {ranked.length} 项）</summary><div className="table-wrap"><table><thead><tr>{['广告系列 / 账户','实际花费（USD）','展示','点击'].map(v=><th scope="col" key={v}>{v}</th>)}{resultHeaders}</tr></thead><tbody>{ranked.slice(0,20).map((r,i)=><tr key={i}><th scope="row">{r.name}<div className="small muted">{data.accounts.find((a:any)=>a.id===r.account)?.name}</div></th><td>{money(r.spent)}</td><td>{number(r.impressions)}</td><td>{number(r.clicks)}</td>{resultCells(r.results)}</tr>)}</tbody></table></div></details>
  <details className="meta-ad-coverage"><summary>数据覆盖与导入说明</summary>{data.accounts.map((a:any)=><p key={a.id}><strong>{a.name}</strong> · 账户 {a.account_ref}<br/>{a.first_date} 至 {a.last_date} · {a.unidentified_count?`${number(a.detail_count)} 条每日明细；其中 ${number(a.unidentified_count)} 条未提供广告编号，未计入广告数量`:`${number(a.ad_count)} 条广告 · ${number(a.detail_count)} 条每日明细`}</p>)}<p className="small muted">包含已删除但有投放数据的广告。账户每天的费用已归集到下方投放记录，不应再次手工录入。数据为导入时的历史快照；若包含当天数据，当天仍可能变化。未来月份无记录代表尚无数据。</p></details>
 </section>;
}
