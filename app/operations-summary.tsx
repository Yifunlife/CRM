'use client';
import SourceBadge from './source-badge';
import CountryDistribution from './country-distribution';
import {useState} from 'react';
const money=(n:number)=> (n/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const amounts=(values:Record<string,number>)=>Object.entries(values).map(([c,n])=>`${c} ${money(n)}`).join(' / ')||'未登记';
const rate=(n:number,d:number)=>d?(n/d*100).toFixed(1)+'%':'—';
export default function OperationsSummary({data,navigate}:{data:any;navigate:(tab:string)=>void}){
 const report=data.operations,dashboard=data.dashboard;
 const [market,M]=useState('外贸');
 if(!dashboard)return <p>暂无运营汇总，请刷新重试。</p>;
 return <div className="acquisition-dashboard">
 <p className="muted">获客期间：{report.from||'最早记录'} 至 {report.to||report.as_of} · 后续成交追踪至 {report.as_of}（北京时间）</p>
 <div className="operations-checks"><strong>待处理</strong><button onClick={()=>navigate('咨询核查')}>来源待确认 {report.customers.filter((c:any)=>c.source_key==='未知来源').length} 位</button><button onClick={()=>navigate('待确认')}>归因待审核 {data.requests.filter((r:any)=>r.state==='待核查').length} 条</button><button onClick={()=>navigate('活动与费用')}>费用待核查 {data.pending_spend.length} 条</button></div>
 <div className="market-switch">{dashboard.sections.map((s:any)=><button key={s.market} aria-pressed={market===s.market} className={market===s.market?'primary':''} onClick={()=>M(s.market)}>{s.market} · {s.total} 位</button>)}</div>
 {dashboard.sections.filter((s:any)=>s.market===market).map((s:any)=><section className="acquisition-market" key={s.market} aria-label={s.market+'获客与承接'}><h3>{s.market==='待确认'?'内外贸待确认':s.market} <span className="small muted">{s.total} 位新增客户</span></h3>
 {!s.total?<p className="muted">本期间暂无该类新增客户。</p>:<>
 <dl className="acquisition-metrics">{[['新增客资',s.total+' 位'],['成交订单',s.orders+' 单'],['成交合同金额',amounts(s.money)],['广告投入',amounts(s.spend)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
 {s.platforms.map((p:any)=><section className="platform-report" key={p.platform} aria-label={p.platform+'广告效果'}><h4><SourceBadge source={p.platform}/> 广告投放 · {s.market}</h4><div className="table-wrap"><table><thead><tr><th>广告投入</th><th>新增客资</th><th>成交订单</th><th>成交合同金额</th><th>广告投产比</th></tr></thead><tbody><tr><td>{amounts(p.spend)}{p.shared_spend&&<small>另有跨市场费用，见下方单列</small>}</td><td>{p.customers} 位</td><td>{p.orders} 单</td><td>{amounts(p.money)}{p.missingContracts>0&&<small>另有 {p.missingContracts} 单金额未登记</small>}</td><td>{Object.entries(p.spend).map(([c,n])=><div key={c}>{c}：{Number(n)>0&&p.money[c]!==undefined?(p.money[c]/Number(n)).toFixed(2)+' 倍':'无法计算'}</div>)}{!Object.keys(p.spend).length&&'无法计算'}</td></tr></tbody></table></div><p className="small muted">同一批获客客户后续成交，金额按币种分开；投产比为合同金额÷广告投入，不代表利润率。</p><h4>本平台客资国家分布</h4><CountryDistribution rows={p.countries}/><details><summary>广告活动明细</summary><div className="table-wrap"><table><thead><tr><th>活动／来源</th><th>客资</th><th>成交单数</th><th>成交客户率</th><th>广告投入</th><th>成交金额</th></tr></thead><tbody>{s.channels.filter((r:any)=>r.platform===p.platform).map((r:any)=><tr key={r.key}><td>{r.label}</td><td>{r.customers}</td><td>{r.orders}</td><td>{rate(r.deal_customers,r.customers)}</td><td>{r.spent_minor===null?(r.shared_spend?'共用费用单列':'未登记'):r.currency+' '+money(r.spent_minor)}</td><td>{amounts(r.money)}</td></tr>)}</tbody></table></div></details></section>)}
 <h4>这批客户的成交回报</h4><dl className="acquisition-metrics">{[['已成交客户',s.converted+' 位'],['已登记合同金额',amounts(s.money)],['净回款（扣除退款）',amounts(s.cash)],['未登记合同金额',s.missingContracts+' 笔成交']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
<details><summary>销售承接与跟进</summary> <h4>销售承接</h4><dl className="acquisition-metrics">{[['待分配',s.unassigned+' 位'],['已分配未联系',s.uncontacted+' 位'],['有效客户已联系',`${s.valid_contacted} / ${s.valid} 位`],['有效客户跟进逾期',s.overdue+' 位'],['平均首次联系用时',s.first_hours===null?'无法计算':s.first_hours.toFixed(1)+' 小时'],['联系用时样本',s.timing_samples+' 位']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
 </details>
 <p className="small">已结束未成交原因：{Object.entries(s.losses).map(([reason,count])=>`${reason} ${count} 位`).join('；')||'暂无已结束未成交记录'}。有效性待核查：{s.unchecked} 位。</p>
 </>}
 </section>)}
 {dashboard.shared.length>0&&<section className="acquisition-market"><h3>共用／待确认广告费用</h3><p className="small muted">同一活动涉及多个市场、市场未明确，或本期间没有新增客户时，费用单列，不重复分摊。</p><ul>{dashboard.shared.map((r:any)=><li key={r.key}>{r.label}：{r.currency} {money(r.spent_minor)}</li>)}</ul></section>}
 <details className="operations-method"><summary>统计口径与数据完整性</summary><p>阿里统一归外贸。其他客户按首次咨询的国家划分，中国大陆归内贸，境外归外贸；国家缺失时仅明确国内渠道归内贸，其余待确认。已确认同一主体的客户去重，未确认的咨询分别暂计。</p><p>销售承接显示这批客户当前状态。首次联系用时从首次分配到其后的首条跟进记录计算；缺少记录不计入平均值。逾期指有效、尚未成交且仍有进行中咨询的下次跟进日期早于今天。</p><p>成交数、合同金额和净回款均追踪这批客户到今天，排除撤销成交与撤销回款。未登记金额不视为零。不同币种分别列示；广告费用只含已确认归因的按日记录。单一市场活动才归集到该市场，跨市场费用不分摊。有效客户成本＝活动费用÷该活动有效客户数，分母为零或费用缺失显示“—”。</p><p>本月收支与本月获客后续成交是不同口径，请在“期间收支”查看按实际发生日期统计的收支。</p></details>
 </div>;
}

function Bars({rows}:{rows:[string,number][]}){const max=Math.max(1,...rows.map(r=>r[1]));return <div className="dashboard-bars">{rows.length?rows.map(([label,n],i)=><div className="dashboard-bar" key={label}><span>{label}</span><div className="dashboard-track"><div style={{width:(n/max*100)+'%',background:['#287b95','#4573c4','#b57a24','#63846b'][i%4]}}/></div><strong>{n}</strong></div>):<p className="muted">暂无数据</p>}</div>;}
