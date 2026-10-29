'use client';
import {useEffect,useState} from 'react';
import {metaTotals,metaResultLabel,type MetaAdMetric} from '../lib/meta-ad-report';
import {opMoney,opToday} from '../lib/operations';
export default function ImportedAccountDaily(){
 const [data,D]=useState<any>(null),[error,E]=useState(''),[month,M]=useState(opToday().slice(0,7)),[account,A]=useState('');
 async function load(){E('');try{const r=await fetch('/api/advertising/meta'),d:any=await r.json();if(!r.ok)throw Error(d.error||'读取失败');D(d);}catch(e:any){E(e.message);}}
 useEffect(()=>{void load();},[]);
 if(error)return <section className="panel"><p role="alert">{error}</p><button onClick={load}>重试导入资料</button></section>;
 if(!data)return <p role="status">正在读取账号导入资料…</p>;
 if(!data.accounts.length)return null;
 const groups=new Map<string,MetaAdMetric[]>();
 for(const r of data.daily as MetaAdMetric[]){if(!r.date.startsWith(month)||(account&&r.account_id!==account))continue;const k=r.date+'|'+r.account_id;groups.set(k,[...(groups.get(k)||[]),r]);}
 const rows=[...groups].sort(([a],[b])=>b.localeCompare(a)).map(([key,v])=>({key,date:v[0].date,account_id:v[0].account_id,...metaTotals(v)}));
 return <section className="panel meta-ad-report"><h2>已入档的账号每日资料</h2><p className="small muted">按原报表账号编号及日期归档，直接读取已导入资料，无需重复录入。下方补充粉丝、发布和成交资料不会重复计入广告费用。</p><div className="meta-ad-filters"><label>月份<input type="month" value={month} onChange={e=>e.target.value&&M(e.target.value)}/></label><label>运营账号<select value={account} onChange={e=>A(e.target.value)}><option value="">全部已导入账号</option>{data.accounts.map((a:any)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div><p>{rows.length} 条账号日资料 · 广告支出 <strong>{opMoney(rows.reduce((n,r)=>n+r.spent,0))} USD</strong></p>{rows.length?<div className="table-wrap"><table><thead><tr>{['日期','运营账号 / 编号','广告支出（USD）','展示次数','链接点击','报表成效','来源'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{rows.map(r=>{const a=data.accounts.find((a:any)=>a.id===r.account_id);return <tr key={r.key}><th scope="row">{r.date}</th><td style={{textAlign:'left'}}>{a?.name}<div className="small muted">{a?.account_ref}</div></td><td>{opMoney(r.spent)}</td><td>{r.impressions.toLocaleString('zh-CN')}</td><td>{r.clicks.toLocaleString('zh-CN')}</td><td className="meta-ad-results">{Object.entries(r.results).map(([k,v])=>`${metaResultLabel(k)}：${v}`).join('；')||'未提供'}</td><td>Meta 原始报表</td></tr>;})}</tbody></table></div>:<p className="muted">所选月份和账号没有导入记录。</p>}<p className="small muted">粉丝总数、发布数量、实际成交及回款：原报表未提供。广告表单线索和消息对话不等同于CRM有效客户或成交。</p></section>;
}
