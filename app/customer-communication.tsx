'use client';
import {useId,useRef,useState} from 'react';
import {communicationExcerpt} from '../lib/communication-summary';
type Props={customer:any;api:(path:string,body?:any)=>Promise<any>;openLead:(id:string)=>void};
export default function CustomerCommunication({customer:c,api,openLead}:Props){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),title=useId();
 const [reply,R]=useState(''),[busy,B]=useState(false),[error,E]=useState('');
 const request=useRef('');
 async function analyze(){B(true);E('');if(!request.current)request.current=crypto.randomUUID();try{const result=await api('cloud/customer-summary',{lead_id:c.id,request_id:request.current});R(result.reply);}catch(e:any){E(e.message);}finally{B(false);}}
 return <><p className="mw-communication-excerpt">{communicationExcerpt(c.last_note)}</p><small className="mw-blocker">{c.manual_blocker?'手动卡点：'+c.manual_blocker:c.blocker?'项目卡点：'+c.blocker:'未标注卡点'}</small><button ref={trigger} type="button" className="text" onClick={()=>dialog.current?.showModal()}>查看沟通重点</button>
 <dialog className="mw-communication-dialog" ref={dialog} aria-labelledby={title} onClose={()=>trigger.current?.focus()}><header><h2 id={title}>{c.name} · 沟通重点</h2><button type="button" onClick={()=>dialog.current?.close()}>关闭</button></header><dl><div><dt>最近记录摘录</dt><dd>{communicationExcerpt(c.last_note)}</dd></div><div><dt>卡点</dt><dd>{c.manual_blocker||c.blocker||'未标注卡点'}</dd></div><div><dt>下一步</dt><dd>{c.next_step||'待安排'} · {c.next_date||'日期待安排'}</dd></div></dl><div className="section-heading"><h3>AI 重点分析</h3><button type="button" disabled={busy||!!reply} onClick={analyze}>{busy?'正在分析…':reply?'已生成分析':'生成重点分析'}</button></div><p className="small muted">按当前客户已归档的最近沟通分析，使用公司 AI 额度。</p>{error&&<p className="notice error" role="alert">{error}</p>}{reply?<p className="mw-ai-summary">{reply}</p>:<p className="muted">生成后查看客户需求、已确认事项、待核实项和建议下一步。</p>}<footer><button type="button" onClick={()=>{dialog.current?.close();openLead(c.id);}}>标注卡点 / 安排跟进</button></footer></dialog></>;
}
