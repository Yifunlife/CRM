'use client';
import {customerMarket} from '../lib/operations-dashboard';
import {customerProfile} from '../lib/customer-profile';
import {contactGradeLabel} from '../lib/contact-kind';
import {countryLabel} from '../lib/report-country';
import {useEffect,useRef} from 'react';
import {BUSINESS_SCOPES} from '../lib/allocation';
import {suiteStamp} from '../lib/sales-suite';
import CustomerInquiry from './customer-inquiry';
import StatusBadge from './status-badge';
import './customer-intake-details.css';
const original=(raw:any)=>{if(typeof raw!=='string')return value(raw);try{return JSON.stringify(JSON.parse(raw),null,2);}catch{return raw;}};
const value=(v:any)=>v==null||v===''?'待补充':typeof v==='object'?JSON.stringify(v,null,2):String(v);
export default function CustomerIntakeDetails({customer,onBack}:{customer:any;onBack:()=>void}){
 const row=customer.intake,payload=row.payload||{},heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'start'});},[customer.id]);
 const profile=customerProfile(customer),domestic=customerMarket(customer)==='内贸';
 const facts=[['客户姓名',customer.name],[domestic?'省份 / 城市':'国家 / 城市',(domestic?profile.province||'省份待补充':countryLabel(customer.country))+' / '+(profile.city||'城市待补充')],['联系方式（电话）',customer.phone],['微信号',profile.wechat],['客户等级',contactGradeLabel(customer.grade||'')],['Email',customer.email],['平台 / 来源',customer.display_source||customer.source],['来源账号',customer.origin_account],['业务范围',BUSINESS_SCOPES.find(s=>s.id===customer.business_scope)?.name||'待确认'],['负责人',(customer.owner_name||'待分配')+(customer.owner_pending?'（原表，待核查）':'')],['进入资料池时间',row.created?suiteStamp(row.created):''],['提交人',row.creator_name]];
 return <div className="role-workspace customer-intake-details"><div className="page-heading"><div><h1 ref={heading} tabIndex={-1} dir="auto">{customer.name}</h1><p>原始咨询资料 · 查看不会改变核查或分配状态。</p></div><button type="button" onClick={onBack}>返回客户列表</button></div>
  <section className="panel"><CustomerInquiry lead={customer}/><div className="section-heading"><h2>客户信息</h2><StatusBadge value={customer.stage||'待核查'}/></div><dl className="intake-facts">{facts.map(([label,v])=><div key={label}><dt>{label}</dt><dd dir="auto">{value(v)}</dd></div>)}</dl></section>
  <section className="panel"><h2>客户需求</h2><p className="intake-text" dir="auto">{value(payload.requirement||customer.detail?.['项目需求描述'])}</p>{payload.summary&&<><h3>咨询摘要</h3><p className="intake-text" dir="auto">{payload.summary}</p></>}{row.last_error&&<><h3>待核查原因</h3><p className="intake-text" dir="auto">{row.last_error}</p></>}</section>
  <section className="panel"><h2>原始咨询资料</h2><pre className="intake-text" dir="auto">{original(row.raw)||'暂无原始内容'}</pre><details><summary>查看原始表单字段</summary><dl className="intake-facts">{Object.entries(payload).map(([key,v])=><div key={key}><dt>{key}</dt><dd dir="auto">{value(v)}</dd></div>)}</dl></details></section>
 </div>;
}
