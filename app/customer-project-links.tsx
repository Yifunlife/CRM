'use client';
import {useEffect,useState} from 'react';
import StatusBadge from './status-badge';
export default function CustomerProjectLinks({leadId,api,openProject,contractsOnly=false}:{leadId:string;api:(path:string)=>Promise<any>;openProject:(id:string)=>void;contractsOnly?:boolean}){
 const [projects,P]=useState<any[]|null>(null),[error,E]=useState(''),[revision,R]=useState(0);
 useEffect(()=>{let live=true;P(null);E('');api('role-workspace/customer-projects?lead_id='+encodeURIComponent(leadId)).then(d=>{if(live)P(d.projects);}).catch(e=>{if(live)E(e.message);});return()=>{live=false;};},[leadId,api,revision]);
 if(contractsOnly)return <div className="dossier-contract-summary"><span>关联合同号</span><div>{error?<span role="alert">读取失败 <button type="button" onClick={()=>R(n=>n+1)}>重试</button></span>:projects===null?'正在读取…':[...new Set(projects.map(p=>p.contractNumber).filter(Boolean))].join('、')||'关联项目尚未登记'}</div><small>在对应项目档案中维护</small></div>;
 return <section className="panel"><div className="section-heading"><h2>关联项目</h2></div>{error&&<p role="alert">读取关联失败：{error} <button onClick={()=>R(n=>n+1)}>重新读取</button></p>}{projects===null&&!error?<p role="status">正在读取关联项目…</p>:projects?.map(p=><div className="deal-record" key={p.id}><div><strong>{p.name}</strong> <StatusBadge value={p.stage}/><p>合同号：{p.contractNumber||'待登记'}</p><p className="small muted">项目地址：{p.projectAddress||'待补充'}</p></div><button onClick={()=>openProject(p.id)}>打开项目档案</button></div>)}{projects?.length===0&&<p className="muted">尚无关联项目。</p>}</section>;
}
