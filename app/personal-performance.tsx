'use client';
import './personal-performance.css';
type Amount={currency:string;amount:number};
export default function PersonalPerformance({role,month,deals,contracts,receipts,delivered}:{role:'sales'|'followup';month:string;deals?:number;contracts:Amount[];receipts?:Amount[];delivered?:Amount[]}){
 const money=(rows:Amount[]|undefined)=>rows?.length?rows.map(r=>r.currency+' '+(r.amount/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})).join(' / '):'—';
 return <section className="personal-performance" aria-label="个人业绩"><strong>个人业绩 <span>{month}</span></strong>{role==='sales'&&<div><span>本月成交</span><b>{deals||0} 单</b></div>}<div><span>{role==='sales'?'本月合同金额':'负责订单合同金额'}</span><b>{money(contracts)}</b></div><div><span>{role==='sales'?'本月实收':'本月完成交付金额'}</span><b>{money(role==='sales'?receipts:delivered)}</b></div></section>;
}
