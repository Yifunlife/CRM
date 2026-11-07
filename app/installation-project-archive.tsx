'use client';
import {useEffect,useState} from 'react';
import {calendarToday} from '../lib/installation-calendar';
import {installationProgress,installationRemaining,installationSchedule} from '../lib/installation-schedule';
import type {InstallationPlan} from '../lib/project-installation';
import InstallationCalendarEditor from './installation-calendar-editor';
import './installation-timeline.css';
type API=(path:string,body?:any)=>Promise<any>;
type Archive={entity:string;name?:string;revision:string;plan:InstallationPlan;can_factory?:boolean;history?:{id:string;created:string;author:string;action:string;plan?:InstallationPlan}[]};
export function InstallationArchiveView({record,edit,open}:{record:Archive;edit?:()=>void;open?:()=>void}){
 const s=installationSchedule(record.plan),today=calendarToday(),value=(v:any)=>v==null||v===''?'待确认':String(v);
 return <section className="panel installation-project-archive"><div className="section-heading"><h2>{record.name?'安装工期与师傅 · '+record.name:'项目档案 · 安装工期与师傅'}</h2><div className="mw-actions">{record.can_factory&&edit&&<button type="button" onClick={edit}>编辑工期与师傅</button>}{open&&<button type="button" onClick={open}>完整安装资料</button>}</div></div><dl className="installation-archive-grid">{[['安装师傅',s.technicians],['安装工期',s.days?s.days+' 天':''],['剩余工期',installationRemaining(record.plan,today)],['计划安装出发',s.start],['计划安装结束',s.end],['转场预留',s.transfer+' 天'],['安装人数',record.plan.factory.people?record.plan.factory.people+' 人':''],['安装负责人',record.plan.factory.project_lead],['当前安装进度',installationProgress(record.plan)],['实际出发',record.plan.travel.actual_departure],['实际安装结束',s.actualEnd],['工厂 / 对接方',record.plan.factory.factory]].map(([k,v])=><div key={String(k)}><dt>{k}</dt><dd>{value(v)}</dd></div>)}</dl><p className="small muted">与订单安装时间表共用同一项目记录，修改后同步生效。</p><details className="installation-archive-history"><summary>工期与师傅变更记录{record.history?.length?' · 最近 '+record.history.length+' 条':''}</summary>{record.history?.length?record.history.map(h=>{const hs=h.plan?installationSchedule(h.plan):null;return <article key={h.id}><p>{h.action}</p>{hs&&<p>师傅：{hs.technicians||'待分配'} · 工期：{hs.days?hs.days+' 天':'待确认'} · {hs.start||'出发待定'} — {hs.end||'结束待定'}</p>}<small>{h.author||'原操作人'} · {new Date(h.created).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</small></article>}):<p className="small muted">尚无安装安排记录。</p>}</details></section>;
}
export default function LeadInstallationDossier({leadId,user,api}:{leadId:string;user:any;api:API}){
 const [records,RECORDS]=useState<Archive[]>([]),[error,ERROR]=useState(''),[revision,REVISION]=useState(0),[editing,EDITING]=useState(''),allowed=['sales','admin','ceo','management'].includes(user.role);
 useEffect(()=>{if(!allowed||!leadId)return;let live=true;RECORDS([]);ERROR('');api('project-installation/dossier?lead='+encodeURIComponent(leadId)).then(d=>{if(live)RECORDS(d.items);}).catch(e=>{if(live)ERROR(e.message);});return()=>{live=false;};},[leadId,api,allowed,revision]);
 if(!allowed)return null;
 return <>{error&&<section className="panel"><p role="alert">安装档案读取失败：{error}</p><button type="button" onClick={()=>REVISION(n=>n+1)}>重新读取</button></section>}{records.map(record=><InstallationArchiveView key={record.entity} record={record} edit={()=>EDITING(record.entity)}/>)}{editing&&<InstallationCalendarEditor initialProject={editing} rows={records.map(r=>({id:r.entity,name:r.name||'当前项目'}))} api={api} close={()=>EDITING('')} saved={()=>REVISION(n=>n+1)}/>}</>;
}
