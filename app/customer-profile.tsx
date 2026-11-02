'use client';
import {useEffect,useId,useState,type ReactNode} from 'react';
import {Pencil,ArrowRight} from 'lucide-react';
import CustomerInquiry from './customer-inquiry';
import ContractFiles from './contract-files';
import {customerSource} from '../lib/customer-source';
import {salesCompanyName} from '../lib/account-classification';
import {can,GRADES} from '../lib/crm';
import {customerProfile,CUSTOMER_PROJECT_STAGES,CUSTOMER_PROJECT_STATUSES,CUSTOMER_FOLLOW_STATUSES} from '../lib/customer-profile';
import './customer-profile.css';
type Props={lead:any;user:any;api:(path:string,body?:any,method?:string)=>Promise<any>;onSaved:()=>Promise<void>;tab:string;onTab:(tab:string)=>void;followup:ReactNode;project:ReactNode;original:ReactNode;onEditingChange?:(editing:boolean)=>void};
const customerTypes=['商户','集团公司','开发商','其他'];
const tabs=[['客户资料','基本资料'],['成交与收款','项目与成交'],['跟进','跟进安排'],['文件归档','文件归档']];
const date=(value:string)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}):value||'待补充';
export default function CustomerProfile({lead,user,api,onSaved,tab,onTab,followup,project,original,onEditingChange}:Props){
 const [contacts,C]=useState<any[]>([]),[busy,B]=useState(false),[error,E]=useState(''),[message,M]=useState(''),[editing,S]=useState(false),[reset,R]=useState(0);
 const detail=lead.detail||{},profile=customerProfile(lead),editable=can(user,'customers_edit'),formId=useId();
 useEffect(()=>{C(detail._contacts||[]);S(false);E('');},[lead.id,detail._profile_revision]);
 useEffect(()=>{M('');},[lead.id]);
 useEffect(()=>{onEditingChange?.(editing);const prevent=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};if(editing)window.addEventListener('beforeunload',prevent);return()=>{onEditingChange?.(false);window.removeEventListener('beforeunload',prevent);};},[editing,onEditingChange]);
 const owner=lead.owner_name||lead.original_owner||'待分配';
 const first=Object.values(detail._sales_progress?.first||{}).map((v:any)=>v.at).filter(Boolean).sort()[0]||'';
 function edit(){E('');M('');S(true);}
 function cancel(){C(detail._contacts||[]);S(false);E('');R(n=>n+1);}
 function switchTab(next:string){if(editing&&next!==tab){E('请先保存或取消当前修改，再切换栏目');return;}E('');onTab(next);}
 async function save(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(!editing||busy||!editable)return;const values=Object.fromEntries(new FormData(e.currentTarget));B(true);E('');M('');
  const selectedProfile=Object.fromEntries(Object.entries(profile).filter(([key,value])=>'profile_'+key in values&&values['profile_'+key]!==value).map(([key])=>[key,values['profile_'+key]]));
  try{
   await api('role-workspace/customer',{id:lead.id,revision:detail._profile_revision||0,base:Object.fromEntries(['name','country','phone','email','grade','next_date'].map(key=>[key,lead[key]])),contacts,country:lead.country||'',method:detail['偏好联系方式']||detail['which_method_would_you_prefer_to_be_contacted_by?']||'',company:salesCompanyName(detail._sales_company),source_note:detail['客户来源说明']||'',...Object.fromEntries(Object.entries(values).filter(([key])=>!key.startsWith('profile_'))),profile:selectedProfile});
   await onSaved();S(false);M('保存成功，修改已生效');
  }catch(e:any){E(e.message);}finally{B(false);}
 }
 function field(name:string,label:string,value:string,type='text',readOnly=false){return <label key={name}>{label}<input name={name} type={type==='date'&&value&&!/^\d{4}-\d{2}-\d{2}$/.test(value)?'text':type} required={name==='name'} defaultValue={value||''} maxLength={name==='phone'?100:200} readOnly={readOnly||!editing} placeholder="待补充"/></label>;}
 function select(name:string,label:string,value:string,options:string[]){return <label>{label}<select name={name} defaultValue={value||''} disabled={!editing}><option value="">待确认</option>{value&&!options.includes(value)&&<option value={value}>{value}（原记录）</option>}{options.map(o=><option key={o}>{o}</option>)}</select></label>;}
 function actions(){return editing&&<div className="dossier-actions"><button type="button" disabled={busy} onClick={cancel}>取消修改</button><button type="submit" className="primary" disabled={busy}>{busy?'正在保存…':'确认修改'}</button></div>;}
 return <div className="customer-dossier">
  <div className="dossier-toolbar"><div className="dossier-tabs" role="tablist" aria-label="客户档案栏目">{tabs.map(([key,label],index)=><button key={key} id={'dossier-tab-'+index} role="tab" aria-selected={tab===key} aria-controls={'dossier-panel-'+index} tabIndex={tab===key?0:-1} onClick={()=>switchTab(key)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:-1;if(next>=0){e.preventDefault();switchTab(tabs[next][0]);if(!editing)document.getElementById('dossier-tab-'+next)?.focus();}}}>{label}</button>)}</div>{editable&&tab!=='文件归档'&&(editing?<div className="dossier-edit-actions" role="group" aria-label="客户资料修改操作"><span className="dossier-editing-state" role="status">编辑中，尚未保存</span><button type="button" disabled={busy} onClick={cancel}>取消修改</button><button type="submit" form={formId} className="primary" disabled={busy}>{busy?'正在保存…':'确认修改'}</button></div>:<button type="button" className="primary dossier-edit" disabled={busy} onClick={edit}><Pencil size={16} aria-hidden="true"/>编辑资料</button>)}</div>
  {error&&<p role="alert" className="notice error">{error}</p>}{message&&<p role="status" className="notice success">{message}</p>}
  <div className="dossier-layout"><div className="dossier-main">
   {tab==='客户资料'&&<div id="dossier-panel-0" role="tabpanel" aria-labelledby="dossier-tab-0"><section className="panel dossier-section"><div className="section-heading"><h2>基本客户资料</h2><span className="small muted">{editing?'编辑客户资料':'客户档案'}</span></div>
    <CustomerInquiry lead={lead}/><form id={formId} key={lead.id+':'+detail._profile_revision+':'+reset} onSubmit={save}><fieldset disabled={busy}><div className="dossier-grid">
     {field('name','客户姓名 *',lead.name)}{field('customer_id','客户 ID',detail._workbench?.desktop_id||lead.id,'text',true)}
     {field('country','国家 / 地区',lead.country)}{field('profile_contact','联系人',profile.contact)}
     {field('phone','电话 / WhatsApp',lead.phone)}{field('email','Email',lead.email,'email')}
     {field('source_display','客户来源',customerSource(lead),'text',true)}{select('profile_customerType','客户类型',profile.customerType,customerTypes)}
     {select('grade','客户等级',lead.grade,GRADES)}{field('owner_display','负责人',owner,'text',true)}
    </div><hr/><h3>补充信息</h3><div className="dossier-grid">
     {field('profile_organization','公司 / 机构',profile.organization)}{field('profile_city','城市',profile.city)}
     {field('method','偏好联系方式',detail['偏好联系方式']||detail['which_method_would_you_prefer_to_be_contacted_by?'])}{field('profile_role','联系人角色',profile.role)}
     <label>所属分公司<select name="company" defaultValue={salesCompanyName(detail._sales_company)} disabled={!editing}><option value="">未指定</option><option>澳洲分公司</option><option>北美分公司</option></select></label>
     {field('source_note','来源补充说明',detail['客户来源说明']||'')}
     <label className="dossier-full">客户备注<textarea name="profile_notes" defaultValue={profile.notes} readOnly={!editing} maxLength={6000} placeholder="补充客户背景、沟通偏好或需要留意的情况" rows={3}/></label>
    </div><details className="dossier-additional"><summary>其他联系人{contacts.length?' · '+contacts.length+' 位':''}</summary>{contacts.map((c,i)=><div className="dossier-contact" key={i}><div className="dossier-grid">{[['name','姓名'],['role','角色'],['phone','电话'],['email','邮箱']].map(([key,label])=><label key={key}>{label}<input required={key==='name'} readOnly={!editing} maxLength={key==='phone'?100:200} value={c[key]||''} onChange={e=>C(contacts.map((p,n)=>n===i?{...p,[key]:e.target.value}:p))}/></label>)}</div>{editing&&<button type="button" onClick={()=>C(contacts.filter((_,n)=>n!==i))}>移除此联系人</button>}</div>)}{editing?<button type="button" disabled={contacts.length>=30} onClick={()=>C([...contacts,{name:'',role:'',phone:'',email:''}])}>添加联系人</button>:!contacts.length&&<p className="muted">尚未添加其他联系人。</p>}</details>{actions()}</fieldset></form>
   </section><details className="dossier-original"><summary>原始咨询资料、业务范围与变更记录</summary>{original}</details></div>}
   {tab==='成交与收款'&&<div className="dossier-stack" id="dossier-panel-1" role="tabpanel" aria-labelledby="dossier-tab-1"><section className="panel dossier-section"><h2>项目与成交信息</h2><form id={formId} key={lead.id+':project:'+detail._profile_revision+':'+reset} onSubmit={save}><fieldset disabled={busy}><div className="dossier-grid">
    {field('profile_project','项目名称',profile.project)}<label>当前阶段<select name="profile_stage" defaultValue={profile.stage} disabled={!editing}><option value="">待确认</option>{profile.stage&&!/^[1-9]$/.test(profile.stage)&&<option value={profile.stage}>{profile.stage}（原记录）</option>}{CUSTOMER_PROJECT_STAGES.map((stage,i)=><option value={i+1} key={stage}>{i+1} · {stage}</option>)}</select></label>
    {select('profile_projectStatus','项目状态',profile.projectStatus,CUSTOMER_PROJECT_STATUSES)}{field('profile_amount','预计金额',profile.amount)}{select('profile_currency','币种',profile.currency,['CNY','USD','AUD'])}{field('profile_closeDate','成交时间（档案登记）',profile.closeDate,'date')}
    <label className="dossier-full">丢单原因<textarea name="profile_lostReason" readOnly={!editing} defaultValue={profile.lostReason} maxLength={6000} rows={2} placeholder="项目未成交或结束时补充"/></label>
   </div><p className="small muted">档案登记与预计金额供跟进参考；正式成交及业绩以已确认成交单、合同和收款记录为准。</p>{actions()}</fieldset></form></section>{project}</div>}
   {tab==='跟进'&&<div className="dossier-stack" id="dossier-panel-2" role="tabpanel" aria-labelledby="dossier-tab-2"><section className="panel dossier-section"><h2>联系时间与跟进安排</h2><form id={formId} key={lead.id+':follow:'+detail._profile_revision+':'+reset} onSubmit={save}><fieldset disabled={busy}><div className="dossier-grid">
    {field('first_display','初次联系（已有记录）',date(first||detail._workbench?.createdAt),'text',true)}{field('last_display','最近联系（已有记录）',date(lead.last_contact||detail._workbench?.lastContact),'text',true)}
    <label className="dossier-full">下一步动作<textarea name="profile_nextAction" readOnly={!editing} defaultValue={profile.nextAction} maxLength={6000} rows={2} placeholder="填写下一次需要完成的具体事项"/></label>
    {field('next_date','下次联系',lead.next_date,'date')}{select('profile_followStatus','跟进状态',profile.followStatus,CUSTOMER_FOLLOW_STATUSES)}
   </div>{actions()}</fieldset></form></section>{followup}</div>}
   {tab==='文件归档'&&<div className="dossier-stack" id="dossier-panel-3" role="tabpanel" aria-labelledby="dossier-tab-3"><section className="panel dossier-section"><h2>合同归档</h2><ContractFiles key={lead.id} api={api} leadId={lead.id}/></section><section className="panel dossier-section"><h2>客户附件</h2><ContractFiles key={lead.id+':attachments'} api={api} leadId={lead.id} attachment/></section></div>}
  </div><div className="dossier-sidebar" role="complementary" aria-label="客户档案摘要"><section className="panel"><h2>当前客户摘要</h2><dl><div><dt>客户等级</dt><dd>{lead.grade||'未评级'}</dd></div><div><dt>项目状态</dt><dd>{profile.projectStatus||lead.status||'待确认'}</dd></div><div><dt>负责人</dt><dd>{owner}</dd></div><div><dt>最近联系</dt><dd>{date(lead.last_contact||detail._workbench?.lastContact)}</dd></div></dl></section><section className="panel"><h2>下一次跟进</h2><div className="dossier-next"><strong>{lead.next_date||'未安排'}</strong><p>{profile.nextAction||'填写下一步动作和联系日期'}</p></div><button type="button" disabled={busy} onClick={()=>{if(editing&&tab!=='跟进'){E('请先保存或取消当前修改');return;}onTab('跟进');if(editable)edit();}}>{editable?'填写跟进安排':'查看跟进安排'}<ArrowRight size={15}/></button></section></div></div>
 </div>;
}
