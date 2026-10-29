'use client';
import {useState} from 'react';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,PieChart,Pie,Cell,BarChart,Bar} from 'recharts';
import {cohortMonthTotal,previousMonth,type CohortMonth,type MonthlyCohorts} from '../lib/crm-monthly-cohort';
import './crm-monthly-cohort.css';
type Metric='customers'|'valid'|'orders'|'money'|'conversion';
const number=(n:number)=>n.toLocaleString('zh-CN',{maximumFractionDigits:2});
function value(row:CohortMonth|null,metric:Metric,currency:string):number|null{
 if(!row)return null;
 if(metric==='conversion')return row.customers?row.converted/row.customers*100:null;
 if(metric==='money'&&!currency)return null;
 if(metric==='money')return row.money[currency]!==undefined?row.money[currency]/100:row.missingContracts?null:0;
 return row[metric];
}
function format(n:number|null,metric:Metric){return n===null?'—':metric==='conversion'?n.toFixed(1)+'%':number(n);}
function change(current:number|null,previous:number|null,metric:Metric){
 if(current===null||previous===null)return '暂无可比值';
 const delta=current-previous;
 if(metric==='conversion')return `较上月 ${delta>0?'+':''}${delta.toFixed(1)} 个百分点`;
 if(previous===0)return current===0?'与上月持平':'上月为 0';
 return `较上月 ${delta>0?'+':''}${(delta/previous*100).toFixed(1)}%`;
}
export default function CrmMonthlyCohort({data}:{data:MonthlyCohorts}){
 const [chart,CH]=useState('customers');
 const [year,Y]=useState(data.asOf.slice(0,4)),[market,M]=useState('外贸'),[platform,P]=useState(''),[selectedCurrency,C]=useState('');
 if(!data.firstMonth)return <section className="crm-monthly"><h3>CRM 每月获客与成交对比</h3><p>暂无已入 CRM 的客资记录。</p></section>;
 const years=Array.from({length:Number(data.asOf.slice(0,4))-Number(data.firstMonth.slice(0,4))+1},(_,i)=>String(Number(data.asOf.slice(0,4))-i));
 const platforms=[...new Set(data.rows.filter(r=>!market||r.market===market).map(r=>r.platform))].sort();
 const currencies=[...new Set(data.rows.filter(r=>(!market||r.market===market)&&(!platform||r.platform===platform)).flatMap(r=>Object.keys(r.money)))].sort();
 const currency=currencies.includes(selectedCurrency)?selectedCurrency:currencies[0]||'';
 const months=Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`).filter(m=>m>=data.firstMonth&&m<=data.asOf.slice(0,7));
 const pairs=months.map(month=>({month,current:cohortMonthTotal(data,month,market,platform),previous:cohortMonthTotal(data,previousMonth(month),market,platform)}));
 const last=pairs.at(-1),metrics:[Metric,string,string][]=[['customers','新增客资','位'],['valid','有效客资（已确认）','位'],['orders','成交订单','单'],['money','成交合同金额',currency],['conversion','最终转化率','']];
 return <section className="crm-monthly" aria-label="CRM 每月获客与成交对比">
 <div className="crm-monthly-toolbar"><h3>CRM 每月获客与成交对比</h3><label>年份<select value={year} onChange={e=>Y(e.target.value)}>{years.map(y=><option key={y}>{y}</option>)}</select></label><label>市场<select value={market} onChange={e=>{M(e.target.value);P('');}}><option value="">全部市场</option>{['内贸','外贸','待确认'].map(m=><option key={m}>{m}</option>)}</select></label><label>来源<select value={platform} onChange={e=>P(e.target.value)}><option value="">全部来源</option>{platforms.map(p=><option key={p}>{p}</option>)}</select></label>{currencies.length>1&&<label>金额币种<select value={currency} onChange={e=>C(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>}{!['sources','channels','conversion'].includes(chart)&&<span className="crm-monthly-legend"><i/>当月 <i/>上月</span>}</div>
 <p className="crm-monthly-note">按首次获客月份统计，后续成交追踪至 {data.asOf}。{year===data.asOf.slice(0,4)&&`${Number(data.asOf.slice(5,7))} 月尚未结束，与上月整月对比。`}转化率＝成交客户 ÷ 新增客资；成交仅统计 CRM 已登记记录。</p>
 <div className="crm-chart-tabs" role="group" aria-label="选择分析内容">{[...metrics.map(([key,title])=>[key,title]),['sources','来源占比'],['channels','渠道对比']].map(([key,title])=><button key={key} aria-pressed={chart===key} onClick={()=>CH(key)}>{title}</button>)}</div>
 <div className="crm-monthly-charts">{metrics.filter(([key])=>key===chart).map(([metric,title,unit])=>{
 const current=value(last?.current||null,metric,currency),previous=value(last?.previous||null,metric,currency);
 const missing=metric==='money'&&pairs.some(p=>p.current?.missingContracts||p.previous?.missingContracts);
 return <figure key={metric}><figcaption><strong>{title}{unit&&`（${unit}）`}</strong><span>{last?.month}：{format(current,metric)}{missing?'*':''} <small>{change(current,previous,metric)}</small></span></figcaption>{pairs.some(p=>(value(p.current,metric,currency)||0)>0)?metric==='conversion'?<div className="crm-chart-canvas"><ResponsiveContainer width="100%" height="100%"><LineChart data={pairs.map(p=>({month:p.month,rate:value(p.current,'conversion',currency)}))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month"/><YAxis unit="%"/><Tooltip formatter={v=>Number(v).toFixed(1)+'%'}/><Line dataKey="rate" name="最终转化率" type="monotone" stroke="#2b5f9e" strokeWidth={3} connectNulls={false}/></LineChart></ResponsiveContainer></div>:<MonthlyBars pairs={pairs} metric={metric} currency={currency} title={title}/>:<div className="crm-chart-empty">{metric==='valid'?'尚无已确认的有效客资；待判定客户不按无效计算。':metric==='money'?'当前筛选下尚无已登记合同金额。':metric==='conversion'?'当前获客批次尚无已登记成交，暂不绘制转化趋势。':'当前筛选下尚无对应记录。'}</div>}{metric==='valid'&&<small>本图最后一个月：{last?.current?.unchecked||0} 位尚未判定有效性</small>}{metric==='money'&&<small>{missing?'* 仅含已登记合同金额；缺失金额不按零计。':currency?'按合同币种分别统计。':'尚无已登记合同金额。'}</small>}{metric==='conversion'&&<small>成交客户 {last?.current?.converted||0} 位 / 新增客资 {last?.current?.customers||0} 位</small>}</figure>;
 })}{['sources','channels'].includes(chart)&&<SourceChart data={platforms.map(name=>({name,value:months.reduce((sum,month)=>sum+(cohortMonthTotal(data,month,market,name)?.customers||0),0)})).filter(r=>(!platform||r.name===platform)&&r.value>0)} pie={chart==='sources'}/>}</div>
 <details><summary>查看月度明细与统计口径</summary><div className="table-wrap"><table><thead><tr><th>首次获客月份</th><th>新增客资</th><th>有效客资</th><th>待判定</th><th>成交订单</th><th>成交客户</th><th>已登记合同金额</th><th>金额缺失订单</th><th>最终转化率</th></tr></thead><tbody>{pairs.map(({month,current:r})=>r&&<tr key={month}><th>{month}</th><td>{r.customers}</td><td>{r.valid}</td><td>{r.unchecked}</td><td>{r.orders}</td><td>{r.converted}</td><td>{Object.entries(r.money).map(([c,n])=>`${c} ${number(n/100)}`).join(' / ')||(r.orders?'未登记':'无成交')}</td><td>{r.missingContracts}</td><td>{format(value(r,'conversion',currency),'conversion')}</td></tr>)}</tbody></table></div><p>已确认同一主体的客户只计首次获客月份；排除未入 CRM 的咨询和撤销订单。有效性取当前确认结果，不把待判定算成无效。订单按单计，成交客户按人去重；一个客户多单不提高客户转化率。图中上月为每个横轴月份的前一个月。资料最早覆盖 {data.firstMonth}，此前显示“—”。</p><p>来源沿用已确认广告活动的平台；尚未归因时使用原始来源，不据此分摊广告费。此图按获客月份追踪后续成交，不是按签约月份统计收入，也不等同于 Meta 表单线索。获客日期带时区时统一换算北京时间。{pairs.reduce((n,p)=>n+(p.current?.dateFallback||0),0)>0&&`其中 ${pairs.reduce((n,p)=>n+(p.current?.dateFallback||0),0)} 位缺少可用获客日期，暂按建档日期归月。`}月度图独立使用完整历史，年份、市场、来源筛选仅作用于本图。</p></details>
 </section>;
}
function MonthlyBars({pairs,metric,currency,title}:{pairs:{month:string;current:CohortMonth|null;previous:CohortMonth|null}[];metric:Metric;currency:string;title:string}){
 const width=420,height=154,left=45,right=8,bottom=25,top=20,plotHeight=height-top-bottom,step=(width-left-right)/Math.max(1,pairs.length),bar=Math.min(16,step*.3);
 const max=Math.max(metric==='conversion'?100:2,...pairs.flatMap(p=>[value(p.current,metric,currency)||0,value(p.previous,metric,currency)||0]));
 const compact=(n:number)=>n>=10000?number(n/10000)+'万':number(n);
 return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title+'每月与上月对比，蓝色当月，橙色上月'}><title>{title+"每月对比"}</title>{[0,.5,1].map(t=><g key={t}><line x1={left} x2={width-right} y1={height-bottom-t*plotHeight} y2={height-bottom-t*plotHeight} stroke="#e3e9f0"/><text x={left-5} y={height-bottom-t*plotHeight+4} textAnchor="end">{metric==='conversion'?(max*t).toFixed(0)+'%':compact(max*t)}</text></g>)}{pairs.map((p,i)=><g key={p.month}>{(['previous','current'] as const).map((period,j)=>{const n=value(p[period],metric,currency),h=n===null?0:n/max*plotHeight,x=left+step*(i+.5)+(j===0?-bar-1:1);return <g key={period}><title>{`${p.month} · ${period==='current'?'当月':'上月 '+previousMonth(p.month)}：${format(n,metric)}${metric==='money'&&p[period]?.missingContracts?'（金额未齐）':''}`}</title>{n===null?<text x={x+bar/2} y={height-bottom-3} textAnchor="middle">—</text>:<><rect x={x} y={height-bottom-Math.max(1,h)} width={bar} height={Math.max(1,h)} fill={period==='current'?'#2b5f9e':'#bd7724'}/>{period==='current'&&<text x={x+bar/2} y={height-bottom-h-5} textAnchor="middle">{metric==='conversion'?n.toFixed(1)+'%':compact(n)}</text>}</>}</g>;})}<text x={left+step*(i+.5)} y={height-6} textAnchor="middle">{Number(p.month.slice(5))}月</text></g>)}</svg>;
}

function SourceChart({data,pie}:{data:{name:string;value:number}[];pie:boolean}){
 const colors=['#2b5f9e','#bd7724','#398579','#8064a2','#a65b66','#687d91'];
 return <figure><figcaption><strong>{pie?'来源占比 · 环形图':'渠道获客对比 · 条形图'}</strong><span>当前所选年份已覆盖月份 · 新增客资</span></figcaption>{!data.length?<p className="crm-chart-empty">当前筛选下暂无来源数据。</p>:<><div className="crm-chart-canvas"><ResponsiveContainer width="100%" height="100%">{pie?<PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="80%" label={p=>`${p.name} ${(Number(p.percent)*100).toFixed(1)}%`}>{data.map((r,i)=><Cell key={r.name} fill={colors[i%colors.length]}/>)}</Pie><Tooltip/></PieChart>:<BarChart data={[...data].sort((a,b)=>b.value-a.value)} layout="vertical" margin={{left:30,right:35}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={110}/><Tooltip/><Bar dataKey="value" name="新增客资" fill="#2b5f9e" label={{position:'right'}}/></BarChart>}</ResponsiveContainer></div><p className="small muted">{data.map(r=>`${r.name}：${number(r.value)} 位`).join(' · ')}</p></>}</figure>;
}
