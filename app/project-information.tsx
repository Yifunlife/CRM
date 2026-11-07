'use client';
import {useEffect,useState} from 'react';
import ProjectResponsibility from './project-responsibility';
import StatusBadge from './status-badge';

type Values={contractNumber:string;projectAddress:string;area:string;height:string};
type Profile={entity:string;version:number;values:Values;can_edit:boolean;contract_locked:boolean};
export default function ProjectInformation({row,api,onSaved,demo=false}:{row:any;api:(path:string,body?:any)=>Promise<any>;onSaved?:()=>Promise<void>;demo?:boolean}){
 const [data,D]=useState<Profile|null>(null),[editing,EDIT]=useState(false),[draft,F]=useState<Profile|null>(null),[busy,B]=useState(false),[error,E]=useState(''),[message,M]=useState(''),[retry,R]=useState(0);
 const initial:Values={contractNumber:row.contractNumber||'',projectAddress:row.projectAddress||'',area:row.area||'',height:row.height||''};
 const path='sales-suite/project/profile?entity='+encodeURIComponent(row.id);
 useEffect(()=>{let live=true;E('');if(demo){D({entity:row.id,version:0,values:initial,can_edit:true,contract_locked:false});return()=>{live=false;};}api(path).then(d=>{if(live)D(d);}).catch(e=>{if(live)E(e.message);});return()=>{live=false;};},[api,path,demo,retry,row.original?.version]);
 const values=editing&&draft?draft.values:data?.values||initial;
 function field(key:keyof Values,label:string,missing='待补充'){
  if(!editing||!draft)return values[key]||missing;
  const props={name:key,'aria-label':label,value:values[key],onChange:(e:{target:{value:string}})=>F({...draft,values:{...draft.values,[key]:e.target.value}})};
  if(key==='projectAddress')return <textarea {...props} rows={2} maxLength={1500} autoComplete="off"/>;
  return <><input {...props} type={key==='area'||key==='height'?'number':'text'} step="any" min={key==='area'||key==='height'?'0':undefined} maxLength={key==='contractNumber'?200:100} readOnly={key==='contractNumber'&&data?.contract_locked}/>{key==='contractNumber'&&data?.contract_locked&&<small>此编号沿用合同资料。</small>}</>;
 }
 const summary=<dl className="mw-summary-list">
  <div><dt>合同号 / 项目编号</dt><dd>{field('contractNumber','合同号 / 项目编号','待登记')}</dd></div><div><dt>国家/地区</dt><dd>{row.country||'待补充'}</dd></div>
  <div><dt>项目地址</dt><dd>{field('projectAddress','项目地址')}</dd></div><div><dt>面积（㎡）</dt><dd>{field('area','面积（㎡）')}</dd></div><div><dt>层高（米）</dt><dd>{field('height','层高（米）')}</dd></div>
  {row.legacyDimensions&&<div><dt>原面积与净高说明</dt><dd>{row.legacyDimensions}</dd></div>}<div><dt>客户</dt><dd>{row.customer}</dd></div>
  <div><dt>项目协作人员</dt><dd>{row.projectId&&!demo&&!editing?<ProjectResponsibility row={row} api={api} onSaved={onSaved}/>:<div className="mw-team-members"><span>主业务：{row.ownerName||'待明确'}</span><span>辅业务：{row.assistantName||'未分配'}</span><span>跟单：{row.followup||'待明确'}</span></div>}</dd></div>
  <div><dt>当前阶段</dt><dd><StatusBadge value={row.stage}/></dd></div><div><dt>当前节点 / 下一步</dt><dd>{row.node||'待安排'}{row.next&&row.next!==row.node&&<small>下一步：{row.next}</small>}<small>{row.date||'日期待明确'}</small></dd></div>
  <div><dt>计划交付时间</dt><dd>{row.deliveryDate||'待补充'}{row.deliveryLabel&&<small>{row.deliveryLabel}</small>}</dd></div>
 </dl>;
 return <section className="panel mw-project-information"><div className="section-heading"><h2>单项目明细</h2>{data?.can_edit&&!editing&&<button type="button" onClick={()=>{F({...data,values:{...data.values}});EDIT(true);E('');M('');}}>编辑项目信息</button>}</div>
  {error&&<p className="notice error" role="alert">{error}{!editing&&<button type="button" onClick={()=>R(n=>n+1)}>重新读取</button>}</p>}{message&&<p className="notice success" role="status">{message}</p>}
  {editing&&draft?<form onSubmit={async e=>{e.preventDefault();B(true);E('');try{if(demo){D(draft);EDIT(false);M('示例项目信息已更新。');return;}await api('sales-suite/project/profile',{entity:row.id,version:draft.version,values:draft.values});D(await api(path));EDIT(false);M('项目信息已保存。');await onSaved?.();}catch(e:any){E(e.message);}finally{B(false);}}}><fieldset disabled={busy}>{summary}<div className="mw-actions"><button className="primary" type="submit">{busy?'正在保存…':'保存项目信息'}</button><button type="button" onClick={()=>{EDIT(false);F(null);E('');}}>取消</button></div></fieldset></form>:summary}
 </section>;
}
