'use client';
import {useRef,useState} from 'react';
import {readGrid,type Grid} from '../lib/import-grid';
import {importDate} from '../lib/order-import';
import {VISIT_COLUMNS,VISIT_IMPORT_LIMIT} from '../lib/customer-meetings';
const normal=(value:string)=>value.trim().toLowerCase().replace(/[\s/／]/g,'');
export default function VisitImport({api,onImported}:{api:(path:string,body?:any)=>Promise<any>;onImported:(result:any)=>void}){
 const [grids,G]=useState<Grid[]>([]),[sheet,S]=useState(0),[mapping,M]=useState<Record<string,string>>({}),[filename,F]=useState(''),[busy,B]=useState(false),[error,E]=useState(''),[preview,P]=useState<any>(null);
 const grid=grids[sheet];
 const [dragging,DRAG]=useState(false),dragDepth=useRef(0);
 function selectSheet(index:number,all=grids){S(index);P(null);M(Object.fromEntries(VISIT_COLUMNS.map(c=>{const matches=all[index].headers.flatMap((h,i)=>[c.label,c.key,...c.aliases].some(a=>normal(a)===normal(h))?[String(i)]:[]);return [c.key,matches.length===1?matches[0]:''];})));}
 async function chooseFile(files:File[]){
  if(busy)return;G([]);P(null);M({});E('');F('');
  if(files.length!==1){E('每次请选择或拖入一个 Excel／CSV 到访表格');return;}
  const file=files[0];F(file.name);B(true);try{const all=await readGrid(file);if(!all.length)throw Error('文件没有工作表');G(all);selectSheet(0,all);}catch(e:any){E(e.message);}finally{B(false);}
 }
 async function execute(mode:'preview'|'import'){
  B(true);E('');try{
   if(!grid)throw Error('请先选择到访表格');
   const rows=grid.rows.filter(row=>row.some(c=>c.trim())).map((row,index)=>Object.fromEntries(VISIT_COLUMNS.map(c=>{let value=row[Number(mapping[c.key])]||'';if(mapping[c.key]===''||mapping[c.key]===undefined)value='';if(c.key==='date'&&value){try{value=importDate(value,grid.date1904);}catch(e:any){throw Error(`第${index+1}条到访日期：${e.message}`);}}return [c.key,value];})));
   const result=await api('sales-management/visits/import',{mode,filename,rows});if(mode==='preview')P(result);else{P(null);onImported(result);}
  }catch(e:any){E(e.message);if(mode==='import')P(null);}finally{B(false);}
 }
 const template='\uFEFF'+VISIT_COLUMNS.map(c=>c.label).join(',')+'\r\n';
 return <section className="mw-visit-import" aria-label="导入到访表单"><div className="mw-visit-import-head"><h3>导入到访表单</h3><a download="到访记录导入模板.csv" href={'data:text/csv;charset=utf-8,'+encodeURIComponent(template)}>下载模板</a></div><p className="small muted">每批最多 {VISIT_IMPORT_LIMIT} 条，匹配现有客户；同名客户请填 CRM 客户 ID。先预览，再确认导入。</p>
 <fieldset disabled={busy}><div className={'mw-visit-drop'+(dragging?' is-dragging':'')} role="group" aria-label="到访表格上传" aria-busy={busy} onDragEnter={e=>{e.preventDefault();if(!busy&&e.dataTransfer.types.includes('Files')){dragDepth.current++;DRAG(true);}}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect=busy?'none':'copy';}} onDragLeave={e=>{e.preventDefault();dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)DRAG(false);}} onDrop={e=>{e.preventDefault();dragDepth.current=0;DRAG(false);void chooseFile(Array.from(e.dataTransfer.files));}}><p>将 Excel／CSV 拖到这里，或选择文件</p><label>选择到访表格<input type="file" accept=".xlsx,.csv" onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)void chooseFile(files);}}/></label><p className="small muted" role="status">{busy?'正在处理表格…':filename?'已选择：'+filename:'每次一个文件，最大25MB；CSV 请使用 UTF-8。'}</p></div>
 {grid&&<><label>工作表<select value={sheet} onChange={e=>selectSheet(Number(e.target.value))}>{grids.map((g,i)=><option key={i} value={i}>{g.name}（{g.rows.length}条）</option>)}</select></label><div className="role-form-grid">{VISIT_COLUMNS.map(c=><label key={c.key}>{c.label}<select value={mapping[c.key]??''} onChange={e=>{M({...mapping,[c.key]:e.target.value});P(null);}}><option value="">请选择对应列</option>{grid.headers.map((h,i)=><option key={i} value={i}>第{i+1}列 · {h||'无标题'}</option>)}</select></label>)}</div><button type="button" onClick={()=>void execute('preview')}>{busy?'正在检查…':'预览并检查'}</button></>}
 </fieldset>{error&&<p className="notice error" role="alert">{error}</p>}
 {preview&&<><h3>导入预览</h3><p role="status">共 {preview.summary.total} 条 · 可导入 {preview.summary.ready} 条 · 重复跳过 {preview.summary.skipped} 条 · 待修正 {preview.summary.invalid} 条</p><div className="table-wrap"><table><thead><tr><th>序号</th><th>客户 / 日期</th><th>参与人</th><th>结论 / 下一步</th><th>检查结果</th></tr></thead><tbody>{preview.rows.map((r:any)=><tr key={r.row}><td>{r.row}</td><td>{r.customer_name||'未匹配'}<small>{r.date}</small></td><td className="mw-wrap">{r.participants}</td><td className="mw-wrap">{r.result}<small>{r.next_action}</small></td><td className="mw-wrap">{r.status}{r.errors.map((e:string,i:number)=><small key={i}>{e}</small>)}</td></tr>)}</tbody></table></div>{preview.summary.invalid>0&&<p role="status">请修正表格或列匹配后重新预览，本批尚未导入。</p>}<button type="button" className="primary" disabled={busy||preview.summary.invalid>0||!preview.summary.ready} onClick={()=>void execute('import')}>{busy?'正在导入…':`确认导入 ${preview.summary.ready} 条到访记录`}</button></>}
 </section>;
}
