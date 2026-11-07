'use client';
import {useEffect,useRef} from 'react';
import {Plus} from 'lucide-react';
import type {InstallationArrivalBatch} from '../lib/project-installation';
import './installation-arrivals.css';
type Props={batches:InstallationArrivalBatch[];editable:boolean;onChange:(batches:InstallationArrivalBatch[])=>void};
export default function InstallationArrivals({batches,editable,onChange}:Props){
 const rows=useRef<HTMLDivElement>(null),added=useRef('');
 useEffect(()=>{if(!added.current)return;const input=rows.current?.querySelector<HTMLInputElement>('[data-arrival-id="'+added.current+'"] input');if(input){input.scrollIntoView({block:'nearest'});input.focus({preventScroll:true});added.current='';}},[batches]);
 function add(){const id=crypto.randomUUID();added.current=id;onChange([...batches,{id,description:'',expected:'',actual:''}]);}
 function change(id:string,key:'description'|'expected'|'actual',value:string){onChange(batches.map(batch=>batch.id===id?{...batch,[key]:value}:batch));}
 return <section className="installation-arrivals" aria-labelledby="installation-arrivals-heading">
  <div className="installation-arrivals-heading"><h3 id="installation-arrivals-heading">货物到货安排 <span role="status">{batches.length?'共 '+batches.length+' 批货':'总批数待登记'}</span></h3><button type="button" className="primary" name="arrival_batches" disabled={!editable||batches.length>=50} onClick={add}><Plus size={16} aria-hidden="true"/>增加一批</button></div>
  {!batches.length?<p>登记总批次及每批预计到货时间。</p>:<div className="installation-arrivals-rows" ref={rows}>
   <div className="installation-arrivals-columns" aria-hidden="true"><span>批次 / 货物、柜数说明</span><span>预计到货日期</span><span>实际到货日期</span></div>
   {batches.map((batch,i)=><div className="installation-arrival-row" key={batch.id} data-arrival-id={batch.id}>
    <div className="installation-arrival-description"><strong className="installation-arrival-number">第{i+1}批</strong><label><span className="installation-arrival-label">货物 / 柜数说明</span><input aria-label={'第'+(i+1)+'批货物说明'} value={batch.description} readOnly={!editable} maxLength={500} onChange={e=>change(batch.id,'description',e.target.value)}/></label></div>
    <label className="installation-arrival-expected"><span className="installation-arrival-label">预计到货日期</span><input name={'arrival-'+batch.id+'-expected'} aria-label={'第'+(i+1)+'批预计到货日期'} type="date" value={batch.expected} readOnly={!editable} onChange={e=>change(batch.id,'expected',e.target.value)}/>{!batch.expected&&<span className="installation-arrival-date-state">预计到货：待确认</span>}</label>
    <div className="installation-arrival-actual"><label><span className="installation-arrival-label">实际到货日期</span><input name={'arrival-'+batch.id+'-actual'} aria-label={'第'+(i+1)+'批实际到货日期'} type="date" value={batch.actual} readOnly={!editable} onChange={e=>change(batch.id,'actual',e.target.value)}/></label><button type="button" className="text installation-arrival-remove" disabled={!editable} aria-label={'移除第'+(i+1)+'批'} onClick={()=>onChange(batches.filter(item=>item.id!==batch.id))}>移除此批</button></div>
   </div>)}
  </div>}
 </section>;
}
export function InstallationArrivalsSummary({batches}:{batches:InstallationArrivalBatch[]}){
 if(!batches.length)return null;
 return <section className="installation-arrivals installation-arrivals-summary"><h3>货物到货安排 · 共 {batches.length} 批货</h3>{batches.map((batch,i)=><p key={batch.id}><strong>第{i+1}批</strong>{batch.description&&<span>{batch.description}</span>}<span>预计到货：{batch.expected||'待确认'}</span><span>实际到货：{batch.actual||'尚未登记'}</span></p>)}</section>;
}
