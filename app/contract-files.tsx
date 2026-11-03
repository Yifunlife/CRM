'use client';
import {useEffect,useId,useRef,useState} from 'react';
import './contract-files.css';
type Api=(path:string,body?:any,method?:string)=>Promise<any>;
export default function ContractFiles({api,leadId,projectId,attachment=false}:{api:Api;leadId?:string;projectId?:string;attachment?:boolean}){
 const [customers,C]=useState<any[]>([]),[query,Q]=useState(''),[selected,S]=useState(leadId||''),[data,D]=useState<any>(null),[project,P]=useState(''),[status,T]=useState('已填写'),[contractNo,N]=useState(''),[file,F]=useState<File|null>(null),[busy,B]=useState(false),[loading,L]=useState(false),[searching,SL]=useState(false),[error,E]=useState(''),[message,M]=useState('');
 const input=useRef<HTMLInputElement>(null),numbersId=useId();
 const noun=attachment?'客户附件':'合同',category=attachment?'&category=attachment':'';
 const endpoint='contract-files?lead_id='+encodeURIComponent(selected)+category;
 async function search(){SL(true);E('');try{const result=await api('contract-files/customers?q='+encodeURIComponent(query));C(result.items);}catch(e:any){E(e.message);}finally{SL(false);}}
 useEffect(()=>{if(!leadId)void search();},[leadId]);
 useEffect(()=>{let live=true;D(null);P(projectId||'');N('');F(null);E('');M('');L(false);if(input.current)input.current.value='';if(!selected)return;L(true);api(endpoint).then(r=>{if(live){D(r);const number=r.projects.find((p:any)=>p.project_id===projectId)?.contract_no;if(number)N(number);}}).catch(e=>{if(live)E(e.message);}).finally(()=>{if(live)L(false);});return()=>{live=false;};},[selected,api,projectId,attachment]);
 async function upload(e:React.FormEvent){
  e.preventDefault();if(!file||!selected||!data?.can_upload||busy)return;B(true);E('');M('');
  try{
   if(!attachment&&!contractNo.trim())throw Error('请填写合同编号');
   if(file.size>100*1024*1024)throw Error('请选择不超过100MB的客户文件');
   const q=new URLSearchParams({lead_id:selected,name:file.name,status,...(attachment?{category:'attachment'}:{contract_no:contractNo.trim()}),...(project?{project_id:project}:{})});
   await api('contract-files?'+q,file,'PUT');F(null);if(input.current)input.current.value='';M(noun+'已上传归档');D(await api(endpoint));
  }catch(e:any){E(e.message);}finally{B(false);}
 }
 const canUpload=!!data?.can_upload&&!loading,showForm=!data||data.can_upload;
 return <div className="contract-files">
  {!attachment&&<p className="small muted">选择客户，填写或选用已有合同编号，上传 Word / PDF 原件。</p>}
  {!leadId&&<><div className="contract-file-search"><label>查找客户<input value={query} disabled={busy} onChange={e=>Q(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void search();}}} placeholder="客户名称或电话"/></label><button type="button" disabled={busy||searching} onClick={()=>void search()}>{searching?'正在查找…':'查找'}</button></div><label>关联客户<select required disabled={busy||searching} value={selected} onChange={e=>{D(null);S(e.target.value);}}><option value="">选择客户（可先按名称或电话查找）</option>{selected&&!customers.some(c=>c.id===selected)&&<option value={selected}>{data?.lead.name||'已选客户'}</option>}{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?' · '+c.phone:''}</option>)}</select></label></>}
  {error&&<p role="alert" className="notice error">{error}</p>}{message&&<p role="status">{message}</p>}{loading&&<p role="status">正在读取{noun}档案…</p>}
  {showForm?<form onSubmit={upload}><fieldset disabled={busy||!canUpload}>
   {!attachment&&<label>合同编号 *<input required maxLength={100} list={numbersId} value={contractNo} onChange={e=>N(e.target.value)} placeholder={selected?'填写编号，或选择已有编号':'请先选择关联客户'}/><datalist id={numbersId}>{data?.contract_numbers?.map((n:string)=><option key={n} value={n}/>)}</datalist></label>}
   <label>{noun}文件<input ref={input} type="file" required accept={attachment?'.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.dwg,.dxf,.zip,.txt':'.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp'} onChange={e=>F(e.target.files?.[0]||null)}/></label>
   <div className="form-row"><label>关联项目（可选）<select disabled={!!projectId} value={project} onChange={e=>{const id=e.target.value;P(id);const number=data?.projects.find((p:any)=>p.project_id===id)?.contract_no;if(number)N(number);}}><option value="">仅归档至客户</option>{data?.projects.map((p:any)=><option key={p.project_id} value={p.project_id}>{p.name}</option>)}</select></label><label hidden={attachment}>合同状态<select value={status} onChange={e=>T(e.target.value)}><option>已填写</option><option>已签署</option></select></label></div>
   <button className="primary" disabled={!file||busy||!canUpload||!attachment&&!contractNo.trim()}>{busy?'正在上传…':'上传'+noun+'并归档'}</button>
   <p className="small muted">{attachment?'支持文档、图片、CAD 图纸和 ZIP 压缩包，单份不超过100MB。':'支持 Word（.doc、.docx）、PDF，也保留 Excel 和图片上传，单份不超过100MB。合同会同步显示在客户档案的“文件归档”中。'}</p>
  </fieldset></form>:<p className="muted">可查看此客户的文件；上传由所属业务员或管理员操作。</p>}
  {data&&<><h3>已归档{noun}</h3>{data.items.filter((f:any)=>!projectId||f.project_id===projectId).map((f:any)=><div className="deal-record" key={f.id}><div>{!attachment&&<p><strong>合同编号：{f.contract_no||'未登记（历史文件）'}</strong></p>}<a href={f.url}>{f.name}</a><p className="small muted">{!attachment&&f.status?f.status+' · ':''}{f.project_name||'客户档案'} · {new Date(f.created).toLocaleString('zh-CN')} · {f.uploaded_by}</p></div></div>)}{!data.items.some((f:any)=>!projectId||f.project_id===projectId)&&<p className="muted">尚未上传{noun}。</p>}</>}
 </div>;
}
