'use client';
import {useState} from 'react';
import PersonalPerformance from './personal-performance';
import {executionTitle,executionCurrent} from '../lib/order-execution';
import {ORDER_STEPS,orderToday,orderReminders} from '../lib/order-followup';
import {moneyLabel,suiteDay} from '../lib/sales-suite';
import './work-todos.css';
export default function FollowupHome({data,userId,open}:{data:any;userId:string;open:(o:any)=>void}){
 const [scope,S]=useState('全部'),[showCompleted,C]=useState(false);
 const orders=data.orders.filter((o:any)=>o.logistics_id===userId),rows:any[]=[];
 for(const o of orders.filter((o:any)=>!o.archived)){
  const tasks=data.tasks.filter((t:any)=>t.order_id===o.id&&t.status==='待处理'&&t.owner_id===userId);
  for(const t of tasks)rows.push({id:'task:'+t.id,order:o,kind:t.kind==='异常'||['重大','紧急'].includes(t.meta?.priority)?'交付风险':'待处理',reason:t.next_action||t.title,date:t.due_at});
  const stage=o.details.execution?.stages?.[executionCurrent(o)?.key||''];
  if(stage?.problem)rows.push({id:'problem:'+o.id,order:o,kind:'交付风险',reason:stage.problem,date:stage.due});
  for(const r of orderReminders(o,[],orderToday()).filter(r=>!(stage?.problem&&r.key==='execution-'+executionCurrent(o)?.key)))rows.push({id:r.key+':'+o.id,order:o,kind:r.overdue?'交付风险':'待处理',reason:r.title,date:r.due});
 }
 const shown=scope==='全部'?rows:rows.filter(r=>r.kind===scope);
 return <section className="sales-suite">{data.performance&&<PersonalPerformance role="followup" {...data.performance}/>}<div className="work-filters">{['全部','交付风险','待处理'].map(s=><button key={s} className={(scope===s?'selected ':'')+(s==='交付风险'?'exceptions':'')} aria-pressed={scope===s} onClick={()=>S(s)}>{s==='全部'?'全部待办':s}<strong>{s==='全部'?rows.length:rows.filter(r=>r.kind===s).length}</strong></button>)}</div><div className="table-wrap"><table><thead><tr><th>事项</th><th>客户 / 项目</th><th>订单</th><th>需要处理</th><th>截止日期</th><th>操作</th></tr></thead><tbody>{shown.map(r=><tr key={r.id}><td>{r.kind}</td><td>{r.order.project}</td><td>{r.order.order_number}</td><td>{r.reason}</td><td>{r.date?(r.date.includes('T')?suiteDay(r.date):r.date):'—'}</td><td><button onClick={()=>open(r.order)}>处理</button></td></tr>)}</tbody></table>{!shown.length&&<p className="empty">暂无待办</p>}</div><div className="ss-panelhead"><h2>我负责的订单</h2><label className="checkbox"><input type="checkbox" checked={showCompleted} onChange={e=>C(e.target.checked)}/>显示已归档</label></div><div className="table-wrap"><table><thead><tr><th>订单 / 项目</th><th>合同金额</th><th>进度</th><th>交付日期</th><th>操作</th></tr></thead><tbody>{orders.filter((o:any)=>showCompleted||!o.archived).map((o:any)=><tr key={o.id}><td>{o.order_number}<p>{o.project}</p></td><td>{o.contract_amount==null?'未登记':moneyLabel(o.contract_amount,o.contract_currency)}</td><td>{o.archived?'已归档':executionTitle(o)||ORDER_STEPS[o.stage]?.name}</td><td>{o.details.execution?.stages?.acceptance?.status==='已完成'?'实际 '+o.details.execution.stages.acceptance.values.date:o.details.delivery_requirements||'待确认'}</td><td><button onClick={()=>open(o)}>查看</button></td></tr>)}</tbody></table></div></section>;
}
