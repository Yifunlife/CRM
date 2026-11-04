'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {communicationExcerpt} from '../lib/communication-summary';
type Props={customer:any;api:(path:string,body?:any)=>Promise<any>;openLead:(id:string)=>void};
type Analysis={needs:string;confirmed:string;pending:string;nextStep:string;source:string;sources:string[];updatedAt:string;messageCount:number};
type Job={id:string;state:string;error?:string};
export default function CustomerCommunication({customer:c,api,openLead}:Props){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),title=useId(),request=useRef('');
 const [analysis,A]=useState<Analysis|null>(null),[job,J]=useState<Job|null>(null),[busy,B]=useState(false),[loading,L]=useState(false),[opened,O]=useState(false),[error,E]=useState('');
 const pending=job?.state==='queued'||job?.state==='running',endpoint='customer-analysis/'+encodeURIComponent(c.id);
 async function open(){dialog.current?.showModal();O(true);L(true);E('');try{const result=await api(endpoint);A(result.analysis);J(result.job);if(!['queued','running'].includes(result.job?.state))request.current='';}catch(e:any){E(e.message);}finally{L(false);}}
 async function analyze(){if(busy||pending)return;B(true);E('');if(!request.current)request.current=crypto.randomUUID();try{J(await api(endpoint,{request_id:request.current}));const result=await api(endpoint);A(result.analysis);J(result.job);if(!['queued','running'].includes(result.job?.state))request.current='';}catch(e:any){E(e.message);}finally{B(false);}}
 useEffect(()=>{
  if(!opened||!pending)return;
  let cancelled=false,timer:ReturnType<typeof setTimeout>;
  async function poll(){try{const result=await api(endpoint);if(cancelled)return;A(result.analysis);J(result.job);E('');if(!['queued','running'].includes(result.job?.state)){request.current='';return;}}catch(e:any){if(!cancelled)E(e.message);}if(!cancelled)timer=setTimeout(poll,2000);}
  timer=setTimeout(poll,1500);return()=>{cancelled=true;clearTimeout(timer);};
 },[opened,pending,endpoint,api]);
 const failed=job&&['failed','uncertain','cancelled'].includes(job.state);
 const updated=analysis?new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(analysis.updatedAt)):'';
 return <><p className="mw-communication-excerpt">{communicationExcerpt(c.last_note)}</p><small className="mw-blocker">{c.manual_blocker?'手动卡点：'+c.manual_blocker:c.blocker?'项目卡点：'+c.blocker:'未标注卡点'}</small><button ref={trigger} type="button" className="text" onClick={open}>查看沟通重点</button>
 <dialog className="mw-communication-dialog" ref={dialog} aria-labelledby={title} onClose={()=>{O(false);trigger.current?.focus();}}><header><h2 id={title}>{c.name} · 沟通重点</h2><button type="button" onClick={()=>dialog.current?.close()}>关闭</button></header><dl><div><dt>最近记录摘录</dt><dd>{communicationExcerpt(c.last_note)}</dd></div><div><dt>卡点</dt><dd>{c.manual_blocker||c.blocker||'未标注卡点'}</dd></div><div><dt>下一步</dt><dd>{c.next_step||'待安排'} · {c.next_date||'日期待安排'}</dd></div></dl>
 <div className="section-heading"><h3>AI 重点分析</h3><button type="button" disabled={loading||busy||pending} onClick={()=>{if(failed)request.current='';void analyze();}}>{busy||pending?'工作台正在分析…':analysis?'重新生成分析':'生成重点分析'}</button></div><p className="small muted">由所属业务员的工作台 AI 分析已归档沟通，结果自动保存到 CRM。手动卡点单独保留。</p>
 <div aria-live="polite" aria-busy={loading||busy||pending}>{loading&&<p className="muted">正在读取已保存分析…</p>}{pending&&<p className="muted">正在等待工作台完成分析，关闭后仍会继续保存。</p>}{error&&<p className="notice error" role="alert">{error}</p>}{failed&&<p className="notice error" role="alert">{job.error||'上次分析未完成，请核对工作台连接后重试。'}{analysis?' 已保留上次分析。':''}</p>}
 {analysis?<><dl className="mw-ai-summary">{([['needs','客户需求'],['confirmed','已确认事项'],['pending','待核实项'],['nextStep','建议下一步']] as const).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{analysis[key]}</dd></div>)}</dl><p className="small muted">来源：{analysis.source} · {analysis.sources.join('、')}<br/>更新时间：<time dateTime={analysis.updatedAt}>{updated}</time></p></>:!loading&&!pending&&<p className="muted">生成后查看客户需求、已确认事项、待核实项和建议下一步。</p>}</div>
 <footer><button type="button" onClick={()=>{dialog.current?.close();openLead(c.id);}}>标注卡点 / 安排跟进</button></footer></dialog></>;
}
