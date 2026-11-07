'use client';
import {useEffect,useState} from 'react';
import StatusBadge from './status-badge';

type Values={contractNumber:string;projectAddress:string;area:string;height:string};
type Person={id:string;name:string};
type Team={owner_id:string;owner_name:string;assistant_id:string;assistant_name:string;followup_id:string;followup_name:string;can_edit:boolean;can_assign_owner:boolean;sales:Person[];followup:Person[]};
type Profile={entity:string;version:number;values:Values;can_edit:boolean;contract_locked:boolean;team?:Team|null};
export default function ProjectInformation({row,api,onSaved,demo=false}:{row:any;api:(path:string,body?:any)=>Promise<any>;onSaved?:()=>Promise<void>;demo?:boolean}){
 const [data,D]=useState<Profile|null>(null),[editing,EDIT]=useState(false),[draft,F]=useState<Profile|null>(null),[busy,B]=useState(false),[error,E]=useState(''),[message,M]=useState(''),[retry,R]=useState(0);
 const initial:Values={contractNumber:row.contractNumber||'',projectAddress:row.projectAddress||'',area:row.area||'',height:row.height||''};
 const path='sales-suite/project/profile?entity='+encodeURIComponent(row.id);
 useEffect(()=>{let live=true;E('');if(demo){D({entity:row.id,version:0,values:initial,can_edit:true,contract_locked:false});return()=>{live=false;};}api(path).then(d=>{if(live)D(d);}).catch(e=>{if(live)E(e.message);});return()=>{live=false;};},[api,path,demo,retry,row.original?.version]);
 const values=editing&&draft?draft.values:data?.values||initial,team=editing&&draft?draft.team:data?.team,ownerName=team?team.owner_name:row.ownerName,assistantName=team?team.assistant_name:row.assistantName,followupName=team?team.followup_name:row.followup;
 function field(key:keyof Values,label:string,missing='待补充'){
  if(!editing||!draft)return values[key]||missing;
  const props={name:key,'aria-label':label,value:values[key],onChange:(e:{target:{value:string}})=>F({...draft,values:{...draft.values,[key]:e.target.value}})};
  if(key==='projectAddress')return <textarea {...props} rows={2} maxLength={1500} autoComplete="off"/>;
  return <><input {...props} type={key==='area'||key==='height'?'number':'text'} step="any" min={key==='area'||key==='height'?'0':undefined} maxLength={key==='contractNumber'?200:100} readOnly={key==='contractNumber'&&data?.contract_locked}/>{key==='contractNumber'&&data?.contract_locked&&<small>此编号沿用合同资料。</small>}</>;
 }
 function changeTeam(key:'owner_id'|'assistant_id'|'followup_id',value:string){if(!draft?.team)return;const next={...draft.team,[key]:value};if(key==='owner_id'&&value===next.assistant_id)next.assistant_id='';F({...draft,team:next});}
 const summary=<dl className="mw-summary-list">
  <div><dt>合同号 / 项目编号</dt><dd>{field('contractNumber','合同号 / 项目编号','待登记')}</dd></div><div><dt>国家/地区</dt><dd>{row.country||'待补充'}</dd></div>
  <div><dt>项目地址</dt><dd>{field('projectAddress','项目地址')}</dd></div><div><dt>面积（㎡）</dt><dd>{field('area','面积（㎡）')}</dd></div><div><dt>层高（米）</dt><dd>{field('height','层高（米）')}</dd></div>
  {row.legacyDimensions&&<div><dt>原面积与净高说明</dt><dd>{row.legacyDimensions}</dd></div>}<div><dt>客户</dt><dd>{row.customer}</dd></div>
  <div><dt>项目协作人员</dt><dd>{editing&&team?.can_edit?<div className="mw-responsibility-fields">
   <label>主业务<select aria-label="项目主业务" value={team.owner_id} disabled={!team.can_assign_owner} onChange={e=>changeTeam('owner_id',e.target.value)}><option value="">待分配</option>{team.owner_id&&!team.sales.some(p=>p.id===team.owner_id)&&<option value={team.owner_id}>{team.owner_name||'原主业务'}</option>}{team.sales.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select>{team.can_assign_owner?<small>同时设为客户负责人</small>:team.owner_id?<small>更换请走客户转交</small>:null}</label>
   <label>辅业务（选填）<select aria-label="项目辅业务" value={team.assistant_id} onChange={e=>changeTeam('assistant_id',e.target.value)}><option value="">不安排</option>{team.assistant_id&&!team.sales.some(p=>p.id===team.assistant_id)&&<option value={team.assistant_id}>{team.assistant_name||'原辅业务'}</option>}{team.sales.filter(p=>p.id!==team.owner_id).map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
   <label>跟单员<select aria-label="项目跟单员" value={team.followup_id} onChange={e=>changeTeam('followup_id',e.target.value)}><option value="">待分配</option>{team.followup_id&&!team.followup.some(p=>p.id===team.followup_id)&&<option value={team.followup_id}>{team.followup_name||'原跟单员'}</option>}{team.followup.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
  </div>:<div className="mw-team-members">{ownerName&&<span>主业务：{ownerName}</span>}{assistantName&&<span>辅业务：{assistantName}</span>}{followupName&&<span>跟单：{followupName}</span>}</div>}</dd></div>
  <div><dt>当前阶段</dt><dd><StatusBadge value={row.stage}/></dd></div><div><dt>当前节点 / 下一步</dt><dd>{row.node||'待安排'}{row.next&&row.next!==row.node&&<small>下一步：{row.next}</small>}<small>{row.date||'日期待明确'}</small></dd></div>
  <div><dt>计划交付时间</dt><dd>{row.deliveryDate||'待补充'}{row.deliveryLabel&&<small>{row.deliveryLabel}</small>}</dd></div>
 </dl>;
 return <section className="panel mw-project-information"><div className="section-heading"><h2>单项目明细</h2>{data?.can_edit&&!editing&&<button type="button" onClick={()=>{F({...data,values:{...data.values},team:data.team?{...data.team}:data.team});EDIT(true);E('');M('');}}>编辑项目信息</button>}</div>
  {error&&<p className="notice error" role="alert">{error}{!editing&&<button type="button" onClick={()=>R(n=>n+1)}>重新读取</button>}</p>}{message&&<p className="notice success" role="status">{message}</p>}
  {editing&&draft?<form onSubmit={async e=>{e.preventDefault();B(true);E('');try{if(demo){D(draft);EDIT(false);M('示例项目信息已更新。');return;}const changed=draft.team&&data?.team&&(['owner_id','assistant_id','followup_id'] as const).some(key=>draft.team![key]!==data.team![key]);await api('sales-suite/project/profile',{entity:row.id,version:draft.version,values:draft.values,...(changed?{team:{base_owner_id:data!.team!.owner_id,owner_id:draft.team!.owner_id,assistant_id:draft.team!.assistant_id,followup_id:draft.team!.followup_id}}:{})});D(await api(path));EDIT(false);M('项目信息已保存。');await onSaved?.();}catch(e:any){E(e.message);}finally{B(false);}}}><fieldset disabled={busy}>{summary}<div className="mw-actions"><button className="primary" type="submit">{busy?'正在保存…':'保存项目信息'}</button><button type="button" onClick={()=>{EDIT(false);F(null);E('');}}>取消</button></div></fieldset></form>:summary}
 </section>;
}
