'use client';
import {useRef,useState} from 'react';
const money=(n:number|null)=>n===null?'未登记':(n/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function OperationsSummary({data,openLead,navigate}:{data:any;openLead:(id:string)=>void;navigate:(tab:string)=>void}){
 const [campaign,C]=useState(''),[grade,G]=useState('全部'),[page,P]=useState(1);
 const customerHeading=useRef<HTMLHeadingElement>(null);
 const report=data.operations,rows=report.rows,customers=report.customers.filter((c:any)=>(!campaign||c.source_key===campaign)&&(grade==='全部'||c.grade===grade)),pages=Math.max(1,Math.ceil(customers.length/50));
 const unknown=report.customers.filter((c:any)=>c.source_key==='未知来源').length,unverified=report.customers.filter((c:any)=>!c.verified).length;
 const active=rows.filter((r:any)=>r.customers||r.consultations||r.spent_minor);
 return <>
 <p>获客日期（北京）：{report.from||'最早记录'} 至 {report.to||report.as_of}；成交追踪至 {report.as_of}。</p>
 <div className="operations-checks"><span>来源未确认：{unknown} 位</span><span>身份未确认、按独立咨询暂计：{unverified} 位</span><button onClick={()=>navigate('待确认')}>归因待确认（全部期间）{data.requests.filter((r:any)=>r.state==='待核查').length} 条</button><button onClick={()=>navigate('活动与费用')}>费用待核查（全部期间）{data.pending_spend.length} 条</button></div>

 <p className="small muted attribution-scroll-hint">左右滑动查看全部列。</p>
 <div className="table-wrap" role="region" aria-label="广告获客转化，可左右滚动" tabIndex={0}><table className="attribution-summary"><thead><tr>{['活动／来源','同期广告花费','新增客户','核查有效','已联系','有效客户中已成交','成交转化率','有效客户成本'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{active.map((r:any)=><tr key={r.key}><td><button className="text" onClick={()=>{C(r.key);G('全部');P(1);customerHeading.current?.focus({preventScroll:true});customerHeading.current?.scrollIntoView({block:'start'});}}>{r.label}</button><div className="small muted">{r.platform}</div></td><td>{r.currency?r.currency+' '+money(r.spent_minor):'—'}</td><td>{r.customers}<div className="small muted">咨询 {r.consultations} 条</div></td><td>{r.valid}<div className="small muted">无效 {r.invalid} · 待核查 {r.unchecked}</div></td><td>{r.contacted}</td><td>{r.converted}</td><td>{r.conversion===null?'—':(r.conversion*100).toFixed(1)+'%'}</td><td>{r.cost_per_valid_minor===null?'—':r.currency+' '+money(r.cost_per_valid_minor)}</td></tr>)}</tbody></table></div>
 {!active.length&&<p>该期间暂无获客或费用记录。先登记广告费用、核查客户来源和有效性。</p>}
 <p className="small muted">转化率＝本批有效客户中已成交人数÷本批有效客户数。有效客户成本＝同期活动花费÷本批有效客户数；未登记费用或分母为零显示“—”。金额分币种，不自动换算。咨询记录统计 CRM 客资，不等于聊天消息数。当前分类与状态显示最新值，不是历史快照。</p>
 <details className="operations-method"><summary>统计口径与去重说明</summary> <p className="small muted">新客户按已确认客户主体的首次录入日期去重；新提交咨询按北京时间入库日，历史导入保留原录入日期。未建立主体的咨询分别暂计，重复数需人工核查。有效客户采用首次咨询的有效性结论，VIP／A／B／C 是客户分类，两者分开统计。成交人数只计算有效客户，每位最多一次，含后续月份成交，排除撤销订单。</p></details>
 <h2 ref={customerHeading} tabIndex={-1}>查看这批客户</h2><div className="form-row"><label>活动／来源<select value={campaign} onChange={e=>{C(e.target.value);P(1);}}><option value="">全部来源</option>{active.map((r:any)=><option key={r.key} value={r.key}>{r.label}</option>)}</select></label><label>客户类别<select value={grade} onChange={e=>{G(e.target.value);P(1);}}>{['全部','VIP','A','B','C','未评级'].map(v=><option key={v}>{v}</option>)}</select></label></div>
 <p>共 {customers.length} 位；VIP {customers.filter((c:any)=>c.grade==='VIP').length} · A {customers.filter((c:any)=>c.grade==='A').length} · B {customers.filter((c:any)=>c.grade==='B').length} · C {customers.filter((c:any)=>c.grade==='C').length} · 未评级 {customers.filter((c:any)=>c.grade==='未评级').length}</p>
 <div className="table-wrap" role="region" aria-label="获客批次客户明细，可左右滚动" tabIndex={0}><table className="operations-customers"><thead><tr>{['客户／获客日期','来源','负责人','类别','有效性','当前状态','成交'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{customers.slice((Math.min(page,pages)-1)*50,Math.min(page,pages)*50).map((c:any)=><tr key={c.key}><td><button className="text" onClick={()=>openLead(c.lead_id)}>{c.name}</button><div className="small muted">{c.acquired}{!c.verified?' · 身份待核查':''}</div></td><td>{rows.find((r:any)=>r.key===c.source_key)?.label}</td><td>{c.owner_name}</td><td>{c.grade}</td><td>{c.quality}</td><td>{c.status}</td><td>{c.deals?'有 '+c.deals+' 笔有效订单':'尚无有效订单'}</td></tr>)}</tbody></table></div>
 <div className="toolbar"><button disabled={page<=1} onClick={()=>P(page-1)}>上一页</button><span>{Math.min(page,pages)} / {pages}</span><button disabled={page>=pages} onClick={()=>P(page+1)}>下一页</button></div>
 </>;
}
