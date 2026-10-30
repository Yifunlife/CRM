'use client';
import {useEffect,useState} from 'react';
import {currencyTotals} from './role-dashboard';
export default function CustomerProjectLinks({leadId,api,openProject}:{leadId:string;api:(path:string)=>Promise<any>;openProject:(id:string)=>void}){
 const [projects,P]=useState<any[]>([]),[error,E]=useState(''),[loading,L]=useState(true);
 useEffect(()=>{let live=true;L(true);api('sales-suite/report').then(d=>{if(live)P(d.projects.filter((p:any)=>p.lead_id===leadId));}).catch(e=>{if(live)E(e.message);}).finally(()=>{if(live)L(false);});return()=>{live=false;};},[leadId]);
 return <section className="panel"><div className="section-heading"><h2>报价单关联</h2><button onClick={()=>openProject('')}>项目与报价管理</button></div>{error&&<p role="alert">读取关联失败：{error}</p>}{loading?<p role="status">正在读取客户项目…</p>:<>{projects.map(p=><div className="deal-record" key={p.project_id}><div><strong>{p.name}</strong><p className="small muted">预计成交：{p.amount_minor==null?'金额待核实':currencyTotals({[p.currency]:p.amount_minor})}</p></div><button onClick={()=>openProject(p.project_id)}>查看与关联报价</button></div>)}{!projects.length&&<p className="muted">此客户尚未建立销售项目，可从项目推进建立后关联报价。原合同及收款记录在“成交与收款”中查看。</p>}</>}</section>;
}
