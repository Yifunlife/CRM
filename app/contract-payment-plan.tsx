'use client';
import {PAYMENT_MILESTONES,paymentPlanRows,calculatePaymentPlan,type PaymentPlanRow} from '../lib/contract-payment-terms';
type Props={templateId:string;value:PaymentPlanRow[];amountMinor:number|null;currency:string;onChange:(value:PaymentPlanRow[])=>void};
export default function ContractPaymentPlan({templateId,value,amountMinor,currency,onChange}:Props){
 const total=value.reduce((sum,row)=>sum+(Number(row.percent)||0),0),complete=value.every(row=>row.percent!==''),valid=complete&&Math.abs(total-100)<0.000001;
 let amounts:string[]=[];
 if(valid&&amountMinor!==null){try{amounts=calculatePaymentPlan(value,amountMinor,currency)?.payments.map(p=>p.amount)||[];}catch{}}
 function change(index:number,patch:Partial<PaymentPlanRow>){onChange(value.map((row,i)=>i===index?{...row,...patch}:row));}
 return <div className="contract-payment-plan" role="group" aria-label="付款方式">
  <label className="payment-count">分几个阶段<select value={value.length} onChange={e=>onChange(paymentPlanRows(templateId,Number(e.target.value)))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} 个阶段</option>)}</select></label>
  <div className="payment-installments">{value.map((row,i)=><div className="payment-installment" key={i}>
   <label>第{i+1}阶段付款节点<select aria-label={'第'+(i+1)+'阶段付款节点'} value={row.milestone} onChange={e=>change(i,{milestone:e.target.value as PaymentPlanRow['milestone']})}>{Object.entries(PAYMENT_MILESTONES).map(([key,label])=><option key={key} value={key}>{label.zh}</option>)}</select></label>
   <label>付款比例<div className="payment-percent"><input aria-label={'第'+(i+1)+'阶段付款比例'} type="number" required min="0.01" max="100" step="0.01" value={row.percent} onChange={e=>change(i,{percent:e.target.value})} placeholder="填写比例"/><span aria-hidden="true">%</span></div></label>
   <div className="payment-amount"><span className="small muted">本阶段金额（{currency}）</span><output aria-label={'第'+(i+1)+'阶段金额'}>{amounts[i]||'—'}</output></div>
  </div>)}</div>
  <p className={'small'+(complete&&!valid?' notice error':' muted')} role="status">合计 {Number(total.toFixed(2))}%{valid?'':complete?'，请调整至100%。':'，各阶段比例合计须为100%。'}{amountMinor===null?' · 合同金额待填写':''}</p>
 </div>;
}
