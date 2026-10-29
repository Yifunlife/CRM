'use client';
import {countryDistribution,continents} from '../lib/country-distribution';
import './country-distribution.css';
export default function CountryDistribution({rows}:{rows:{country:string;customers:number}[]}){
 const d=countryDistribution(rows);
 const fmt=(n:number)=>n.toLocaleString('zh-CN'),pct=(n:number)=>d.total?(n/d.total*100).toFixed(1)+'%':'0%';
 if(!d.total)return <p className="muted">本期间暂无客资国家数据。</p>;
 return <div className="country-distribution"><section><h5>国家前 10 名</h5><ol>{d.top.map(([name,n])=><li key={name}><span>{name}</span><meter min={0} max={d.top[0]?.[1]||1} value={n} aria-label={`${name} ${fmt(n)} 位`}/><strong>{fmt(n)} 位</strong><small>{pct(n)}</small></li>)}</ol>{d.other>0&&<p className="small muted">其他国家合计 {fmt(d.other)} 位 · {pct(d.other)}</p>}</section><section><h5>五大洲分布</h5><dl className="continent-data">{continents.map(c=><div key={c}><dt>{c}</dt><dd>{fmt(d.counts[c])} 位</dd><dd>{pct(d.counts[c])}</dd></div>)}</dl><p className="small muted">美洲含南、北美洲；占比按本平台全部客资计算。</p>{d.unknown>0&&<p className="small">洲别待确认 {fmt(d.unknown)} 位 · {pct(d.unknown)}（国家未登记、无法识别或暂未映射）</p>}</section></div>;
}
