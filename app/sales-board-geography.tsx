'use client';
import {useState} from 'react';
import {REGION_GRADES,type CustomerGeography} from '../lib/sales-board-geography';
import './sales-board-geography.css';

const label={A:'A 类',B:'B 类',C:'C 类',other:'其他/未评级'};
const count=(n:number)=>n.toLocaleString('zh-CN');
const pct=(n:number,total:number)=>(total?n/total*100:0).toFixed(1)+'%';
export default function SalesBoardGeography({markets,total,totalGrades}:{markets:{name:string;distribution:CustomerGeography}[];total:number;totalGrades:Record<string,number>}){
 const [selection,select]=useState<Record<string,string>>({});
 const otherGrades=total-['A','B','C'].reduce((n,g)=>n+(totalGrades[g]||0),0),unclassified=total-markets.reduce((n,m)=>n+m.distribution.total,0);
 return <section className="panel so-geography" data-mobile-panel="geography" aria-label="客户地域与等级分布">
  <div className="section-heading"><div><h2>客户地域与等级分布</h2><p className="small muted">按客户数排序 · 当前存量</p></div><div className="so-geography-legend" aria-label="客户等级图例">{REGION_GRADES.filter(g=>g!=='other'||otherGrades>0).map(g=><span key={g}><i className={'so-region-'+g} aria-hidden="true"/>{label[g]} {count(g==='other'?otherGrades:totalGrades[g]||0)}</span>)}</div></div>
  <div className={'so-geography-markets'+(markets.length===1?' is-single':'')}>{markets.map(({name,distribution:d})=>{
   const unit=d.kind==='city'?'城市':'国家',selected=d.top.find(r=>r.key===selection[name])||d.top[0],max=d.top[0]?.total||1;
   return <section className="so-geography-market" key={name} aria-label={name+unit+'与客户等级分布'}>
    <div className="so-geography-heading"><h3>{name} · {unit}前 10</h3><span className="small muted">客户总数 <strong>{count(d.total)}</strong> 家</span></div>
    <div className="so-geography-summary">{REGION_GRADES.filter(g=>g!=='other'||d.grades.other>0).map(g=><span key={g}>{label[g]} <strong>{count(d.grades[g])}</strong> · {pct(d.grades[g],d.total)}</span>)}</div>
    {d.top.length?<><div className="so-geography-columns" aria-hidden="true"><span>#</span><span>{unit}</span><span>客户数 / 等级构成</span><span>家</span></div><ol className="so-geography-ranking">{d.top.map((r,i)=><li key={r.key}><button type="button" className="so-geography-row" aria-pressed={selected.key===r.key} onClick={()=>select(v=>({...v,[name]:r.key}))} aria-label={`${r.name}，共${r.total}家，${REGION_GRADES.map(g=>label[g]+r.grades[g]+'家').join('，')}`}><span className="so-geography-rank">{i+1}</span><span>{r.name}</span><span className="so-geography-bar" style={{width:r.total/max*100+'%'}} aria-hidden="true">{REGION_GRADES.map(g=><i key={g} className={'so-region-'+g} style={{width:r.grades[g]/r.total*100+'%'}}/>)}</span><strong>{count(r.total)}</strong></button></li>)}</ol><div className="so-geography-detail" aria-live="polite"><p><strong>{selected.name}</strong>　{count(selected.total)} 家 · 占{name} {pct(selected.total,d.total)}</p><div>{REGION_GRADES.filter(g=>g!=='other'||selected.grades.other>0).map(g=><span key={g}>{label[g]} {count(selected.grades[g])} 家 · {pct(selected.grades[g],selected.total)}</span>)}</div></div></>:<p className="small muted">{d.total?'客户'+unit+'尚未补充，请在客户档案中完善。':'当前范围暂无客户。'}</p>}
    <p className="so-geography-footer">前 10{unit} {count(d.top.reduce((n,r)=>n+r.total,0))} 家 · 其他{unit} {count(d.other)} 家 · 待补{unit} {count(d.unknown)} 家</p>
   </section>;
  })}</div>
  {unclassified>0&&<p className="so-geography-footer">另有 {count(unclassified)} 家业务范围待确认，计入客户总数，未纳入内贸或外贸排名。</p>}
 </section>;
}
