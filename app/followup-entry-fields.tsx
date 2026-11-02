'use client';
import {useId,useRef,useState} from 'react';
import {entryChoice,contentChoices,OTHER_ENTRY} from '../lib/followup-entry-options';
export function FollowupChoice({label,name,options,saved='',required=false,detailAlways=false}:{label:string;name:string;options:string[];saved?:string;required?:boolean;detailAlways?:boolean}){
 const initial=entryChoice(saved,options),[choice,C]=useState(initial.choice),[detail,D]=useState(initial.detail),id=useId();
 const value=choice===OTHER_ENTRY?detail:choice+(detailAlways&&detail?'\n'+detail:'');
 return <div className="fd-choice"><label htmlFor={id}>{label}</label><select id={id} aria-label={label} value={choice} required={required} onChange={e=>C(e.target.value)}><option value="">请选择</option>{[...options,OTHER_ENTRY].map(option=><option key={option}>{option}</option>)}</select>{(choice===OTHER_ENTRY||detailAlways)&&<label className="fd-choice-detail">{detailAlways?'具体沟通依据':'补充说明'}<textarea aria-label={label+'补充说明'} value={detail} rows={2} maxLength={2000} required={required} placeholder={detailAlways?'记录时间、邮件主题、接收人或附件位置':'填写具体情况；原有手填内容保留在这里'} onChange={e=>D(e.target.value)}/></label>}<input type="hidden" name={name} value={value}/></div>;
}
export function CustomerContentChoices({options,saved='',sent}:{options:string[];saved?:string;sent:boolean}){
 const all=['尚未同步',...options],initial=contentChoices(saved,all),[selected,S]=useState(initial.selected),[detail,D]=useState(initial.detail),id=useId(),menu=useRef<HTMLDetailsElement>(null);
 function toggle(option:string,checked:boolean){S(values=>checked?option==='尚未同步'?[option]:[...values.filter(value=>value!=='尚未同步'),option]:values.filter(value=>value!==option));}
 const value=[...selected.filter(option=>option!==OTHER_ENTRY),...(selected.includes(OTHER_ENTRY)&&detail?[detail]:[])].join('\n');
 return <div className="fd-choice fd-content"><span id={id}>向客户同步了什么（可多选）</span><details ref={menu} className="fd-multi"><summary aria-labelledby={id+' '+id+'-summary'}><span id={id+'-summary'}>{selected.length?selected.join('；'):'请选择，可多选'}</span></summary><div className="fd-multi-options" role="group" aria-labelledby={id}>{[...all,OTHER_ENTRY].map(option=><label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={e=>toggle(option,e.target.checked)}/><span>{option}</span></label>)}</div>{selected.includes(OTHER_ENTRY)&&<label className="fd-choice-detail">其他同步内容<textarea aria-label="其他同步内容" rows={2} value={detail} maxLength={2000} required={sent} onInvalid={()=>{if(menu.current)menu.current.open=true;}} onChange={e=>D(e.target.value)}/></label>}</details><input type="hidden" name="customer_content" value={value}/></div>;
}
