'use client';
import {useEffect,useState} from 'react';
import Workflow from './workflow';
import './work-todos.css';
import {suiteStamp} from '../lib/sales-suite';
export default function ManagementWork({api,user,navigate,openLead,openOrder,choose}:{api:any;user:any;navigate:any;openLead:any;openOrder:any;choose:any}){
 const [data,D]=useState<any>(null),[error,E]=useState(''),[scope,S]=useState('全部'),[handover,H]=useState(false);
 async function load(){try{D(await api('role-home'));E('');}catch(e:any){E(e.message);}}
 useEffect(()=>{void load();const timer=setInterval(load,60000);return()=>clearInterval(timer);},[user.id]);
 const rows=data?.todos||[],shown=scope==='全部'?rows:rows.filter((r:any)=>r.kind===scope);
 function act(r:any){if(r.page==='我的交接'){H(true);return;}if(r.order_id){openOrder?.(r.order_id);return;}if(r.project_id){choose(r.project_id);return;}if(r.page==='客户经营'){navigate(r.page);return;}if(r.lead_id)openLead(r.lead_id);}
 return <>{error&&<p role="alert" className="error">{error}<button onClick={load}>重试</button></p>}{!data&&!error?<p>正在读取待办…</p>:<section className="panel work-todos"><div className="work-filters">{['全部','待分配','需协调','需督办','待确认'].map(s=><button key={s} aria-pressed={scope===s} className={(scope===s?'selected ':'')+(s==='待分配'?'new':'')} onClick={()=>S(s)}>{s==='全部'?'全部待办':s}<strong>{s==='全部'?rows.length:rows.filter((r:any)=>r.kind===s).length}</strong></button>)}</div><div className="table-wrap"><table><thead><tr><th>事项 / 项目</th><th>负责人 / 来源</th><th>需要处理</th><th>操作</th></tr></thead><tbody>{shown.map((r:any)=><tr key={r.id}><td><span>{r.kind}</span><strong>{r.name}</strong></td><td>{r.owner||'—'}</td><td>{r.reason}<p>{r.date?.includes('T')?suiteStamp(r.date):r.date}</p></td><td><button onClick={()=>act(r)}>{r.action}</button></td></tr>)}</tbody></table></div>{!shown.length&&<p className="empty">暂无待办</p>}</section>}{handover&&<section className="panel"><button onClick={()=>H(false)}>收起</button><Workflow section="人员交接" personal api={api} user={user} onSaved={load}/></section>}</>;
}
