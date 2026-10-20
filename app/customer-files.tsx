'use client';
import {useEffect,useState} from 'react';
export default function CustomerFiles({desktopId}:{desktopId:string}){
 const [files,F]=useState<any[]>([]),[error,E]=useState(''),[busy,B]=useState(false);
 const endpoint='/api/workbench/files?desktop_id='+encodeURIComponent(desktopId);
 async function load(){const r=await fetch(endpoint);const d:any=await r.json();if(!r.ok)throw Error(d.error||'读取附件失败');F(d);}
 useEffect(()=>{F([]);E('');load().catch(e=>E(e.message));},[desktopId]);
 return <section><h3>云端附件</h3><p>图片和文件保存到云端，单个文件不超过100MB。</p>{error&&<p role="alert">{error}</p>}<label>上传文件<input type="file" disabled={busy} onChange={async e=>{
  const input=e.currentTarget,file=input.files?.[0];if(!file)return;
  if(file.size>100*1024*1024){E('文件不能超过100MB');return;}
  B(true);E('');try{const r=await fetch(endpoint+'&name='+encodeURIComponent(file.name),{method:'PUT',body:file});const d:any=await r.json();if(!r.ok)throw Error(d.error||'上传失败');await load();input.value='';}catch(e:any){E(e.message);}finally{B(false);}
 }}/></label>{busy&&<p role="status">正在上传…</p>}{files.map(f=><article className="wb-archive-record" key={f.id}><a href={f.url} download>{f.name}</a><small>{Math.ceil(f.size/1024)} KB</small></article>)}{!files.length&&!busy&&<p>暂无云端附件。</p>}</section>;
}
