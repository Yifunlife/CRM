'use client';
import {useState} from 'react';
import {countryDistribution,continents} from '../lib/country-distribution';
import {coastlines} from '../lib/country-geography';
import './country-distribution.css';
const centers:Record<string,number[]>={'亚洲':[100,25],'欧洲':[20,45],'非洲':[20,0],'美洲':[-85,10],'大洋洲':[150,-20]};
export default function CountryDistribution({rows}:{rows:{country:string;customers:number}[]}){
 const [focus,F]=useState('亚洲'),d=countryDistribution(rows),[lon,lat]=centers[focus],r=Math.PI/180;
 const project=([x,y]:number[])=>{const a=(x-lon)*r,b=y*r,c=lat*r,z=Math.sin(c)*Math.sin(b)+Math.cos(c)*Math.cos(b)*Math.cos(a);return [160+140*Math.cos(b)*Math.sin(a),160-140*(Math.cos(c)*Math.sin(b)-Math.sin(c)*Math.cos(b)*Math.cos(a)),z];};
 const path=coastlines.map(line=>{let visible=false;return line.map(p=>{const [x,y,z]=project(p);if(z<0){visible=false;return '';}const command=visible?'L':'M';visible=true;return command+x.toFixed(1)+','+y.toFixed(1);}).join(' ');}).join(' ');
 const fmt=(n:number)=>n.toLocaleString('zh-CN'),pct=(n:number)=>d.total?(n/d.total*100).toFixed(1)+'%':'0%';
 if(!d.total)return <p className="muted">本期间暂无客资国家数据。</p>;
 return <div className="country-distribution"><section><h5>国家前 10 名</h5><ol>{d.top.map(([name,n])=><li key={name}><span>{name}</span><meter min={0} max={d.top[0]?.[1]||1} value={n} aria-label={`${name} ${fmt(n)} 位`}/><strong>{fmt(n)} 位</strong><small>{pct(n)}</small></li>)}</ol>{d.other>0&&<p className="small muted">其他国家合计 {fmt(d.other)} 位 · {pct(d.other)}</p>}</section><section><h5>五大洲分布</h5><div className="continent-layout"><svg viewBox="0 0 320 320" role="img" aria-label={`地球示意图，当前朝向${focus}。${focus}客资${fmt(d.counts[focus])}位，占${pct(d.counts[focus])}`}><circle cx="160" cy="160" r="140" fill="#edf4f8" stroke="#b9c7d9"/><ellipse cx="160" cy="160" rx="70" ry="140" fill="none" stroke="#d4e1ea"/><ellipse cx="160" cy="160" rx="140" ry="48" fill="none" stroke="#d4e1ea"/><path d={path} fill="none" stroke="#52778c" strokeWidth=".7"/><circle cx="160" cy="160" r="5" fill="#264b82"/></svg><div className="continent-list">{continents.map(c=><button key={c} type="button" aria-pressed={focus===c} onClick={()=>F(c)}><span>{c}</span><strong>{fmt(d.counts[c])} 位</strong><small>{pct(d.counts[c])}</small></button>)}</div></div><p className="small muted">点击洲名切换地球朝向；美洲合并南、北美洲。占比以本平台全部客资为分母。</p>{d.unknown>0&&<p className="small">洲别待确认 {fmt(d.unknown)} 位 · {pct(d.unknown)}（国家未登记、无法识别或暂未映射）</p>}<p className="small muted">地理示意：Natural Earth；跨洲国家按单一报表洲别统计。</p></section></div>;
}
