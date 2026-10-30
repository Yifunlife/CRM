'use client';
import {useEffect,useState} from 'react';
import {ArrowRight,RefreshCw} from 'lucide-react';
import {HOME_QUEUES} from '../lib/sales-home';
import {salesStamp} from '../lib/sales-pipeline';
import './sales-home.css';

type Props={active:boolean;user:any;api:(path:string)=>Promise<any>;openLead:(id:string)=>void;navigate:(page:string)=>void};
const amount=(rows:any[])=>rows.length?rows.map(r=>`${r.currency} ${(r.amount/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`).join(' / '):'暂无登记';
function Pager({count,page,setPage}:{count:number;page:number;setPage:(page:number)=>void}){const pages=Math.max(1,Math.ceil(count/8));return <div className="sales-home-pages"><span>共 {count} 项 · 第 {page} / {pages} 页</span><button disabled={page===1} onClick={()=>setPage(page-1)}>上一页</button><button disabled={page===pages} onClick={()=>setPage(page+1)}>下一页</button></div>;}
function CustomerContext({row}:{row:any}){return <><p className="sales-home-requirement">{row.requirement||'项目需求待补充'}</p><dl className="sales-home-context"><div><dt>上次进展</dt><dd>{row.last_note||'尚无沟通记录'}{row.last_contact&&<small>最近联系：{salesStamp(row.last_contact)}</small>}</dd></div><div><dt>下一步</dt><dd>{row.next_step||'请在跟进记录中补充下一步'}<small>下次跟进：{row.next_date||'未安排'}</small></dd></div></dl></>;}
export default function SalesHome({active,user,api,openLead,navigate}:Props){
 const [data,D]=useState<any>(null),[error,E]=useState(''),[loading,L]=useState(true),[revision,R]=useState(0);
 const [queue,Q]=useState('all'),[query,S]=useState(''),[page,P]=useState(1),[projectPage,PP]=useState(1),[taskPage,TP]=useState(1);
 useEffect(()=>{if(!active)return;let mounted=true,pending=false;const load=async()=>{if(pending)return;pending=true;if(mounted)L(true);try{const next=await api('sales-home');if(mounted){D(next);E('');}}catch(e:any){if(mounted)E(e.message||'读取失败');}finally{pending=false;if(mounted)L(false);}};void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},60000);return()=>{mounted=false;clearInterval(timer);};},[api,user.id,revision,active]);
 const todos=(data?.todos||[]).filter((r:any)=>(queue==='all'||r.tags.includes(queue))&&(!query||[r.name,r.company,r.country,r.requirement,r.next_step].join(' ').toLowerCase().includes(query.toLowerCase())));
 const projects=data?.projects||[],collaboration=[...(data?.handovers||[]).map((h:any)=>({...h,type:'handover'})),...(data?.tasks||[]).map((t:any)=>({...t,type:'task'}))];
 const current=Math.min(page,Math.max(1,Math.ceil(todos.length/8))),projectCurrent=Math.min(projectPage,Math.max(1,Math.ceil(projects.length/8))),taskCurrent=Math.min(taskPage,Math.max(1,Math.ceil(collaboration.length/8)));
 return <div className="sales-home">
  <div className="page-heading"><div><h1>我的工作</h1><p>{user.name}，从今天需要处理的客户开始。</p></div><div className="sales-home-actions"><button onClick={()=>navigate('我的客资')}>客户列表<ArrowRight size={16}/></button><button disabled={loading} onClick={()=>R(revision+1)}><RefreshCw size={16}/>{loading?'正在更新…':'刷新'}</button></div></div>
  {error&&<p className="notice error" role="alert">首页读取失败：{error}。{data?'以下保留上次结果，请刷新后核对。':'请重试，或从客户列表继续工作。'} <button disabled={loading} onClick={()=>R(revision+1)}>重试</button></p>}
  {!data?<section className="panel" aria-busy={loading}><p role="status">{loading?'正在整理你的客户、交接和业绩…':'暂时无法显示首页数据。'}</p></section>:<>
   <p className="sales-home-updated">本人负责客户 {data.customer_count} 位 · 更新于 {salesStamp(data.at)}（北京时间；跟进期限沿用原业务规则）</p>
   <section className="panel sales-home-todos" aria-labelledby="sales-home-todos-title">
    <div className="section-heading"><div><h2 id="sales-home-todos-title">今日待办</h2><p className="small muted">先处理逾期和今日到期，再查看新咨询、首次联系与待安排客户。同一客户合并展示；历史资料核实不计入待办。</p></div></div>
    <div className="sales-home-queues" role="group" aria-label="待办分类">{HOME_QUEUES.map(([key,label])=><button key={key} aria-pressed={queue===key} className={queue===key?'selected':''} onClick={()=>{Q(key);P(1);}}>{label}<strong>{key==='all'?data.todos.length:data.todos.filter((r:any)=>r.tags.includes(key)).length}</strong></button>)}</div>
    <label className="sales-home-search">查找待办客户<input value={query} onChange={e=>{S(e.target.value);P(1);}} placeholder="客户、公司、需求或下一步"/></label>
    <div className="sales-home-list">{todos.slice((current-1)*8,current*8).map((r:any)=><article key={r.id} className="sales-home-customer"><div className="sales-home-row-heading"><div><button className="text customer" onClick={()=>openLead(r.id)}>{r.name}</button><p className="small muted">{[r.company,r.country||'国家待补充',r.grade||'未评级'].filter(Boolean).join(' · ')}</p></div><button onClick={()=>openLead(r.id)}>查看并跟进<ArrowRight size={16}/></button></div><div className="sales-home-reasons">{r.reasons.map((reason:string,i:number)=><span key={reason} className={'badge '+(i===0&&r.tags.includes('overdue')?'warn':'')}>{reason}</span>)}</div><CustomerContext row={r}/><p className="small muted">{r.label}{r.assigned_at?' · 分配于 '+salesStamp(r.assigned_at):' · 分配时间待补充'}{r.status==='暂停跟进'?' · 暂停客户仅提醒复查':''}</p></article>)}</div>
    {!todos.length&&<p className="sales-home-empty">{query||queue!=='all'?'当前条件下没有待办客户，可切换分类或清空搜索。':'当前没有到期待办或待安排客户，可查看重点项目继续推进。'}</p>}
    <Pager count={todos.length} page={current} setPage={P}/>
    <p className="small muted">新咨询依据 CRM 已入档记录与最近联系时间判断。聊天未读消息请到 <button className="text" onClick={()=>navigate('销售工作台')}>客户沟通</button> 查看。</p>
   </section>
   <section className="panel" aria-labelledby="sales-home-projects-title"><div className="section-heading"><div><h2 id="sales-home-projects-title">重点项目</h2><p className="small muted">正在沟通、已登记回复、设计、价格交涉及成交待交接。按实际记录展示。</p></div><button onClick={()=>navigate('订单跟单')}>跟进情况<ArrowRight size={16}/></button></div>
    {projects.slice((projectCurrent-1)*8,projectCurrent*8).map((r:any)=><article className="sales-home-customer" key={r.id}><div className="sales-home-row-heading"><div><button className="text customer" onClick={()=>openLead(r.id)}>{r.name}</button><p className="small muted">{r.country||'国家待补充'} · {r.label}</p></div><button onClick={()=>r.handover_pending?navigate('订单跟单'):openLead(r.id)}>{r.handover_pending?'办理成交交接':'查看项目'}<ArrowRight size={16}/></button></div><CustomerContext row={r}/><p className="small muted">{r.handover_pending?`${r.handover_pending} 个成交单待建立跟单`:r.stage_days!==null?`当前阶段已持续 ${r.stage_days} 天`:'阶段开始时间待补充'}{r.reply_at?' · 客户最近回复：'+salesStamp(r.reply_at):''}{r.budget?' · 已登记预算：'+r.budget:''}</p></article>)}
    {!projects.length&&<p className="sales-home-empty">尚无已登记的重点阶段项目。在客户详情记录实际回复或销售阶段后，会在这里显示。</p>}<Pager count={projects.length} page={projectCurrent} setPage={PP}/>
   </section>
   <section className="panel" aria-labelledby="sales-home-collaboration-title"><div className="section-heading"><div><h2 id="sales-home-collaboration-title">内部协作</h2><p className="small muted">与我有关的待接收交接、本人任务及我负责商务的订单待办。</p></div><button onClick={()=>navigate('我的交接')}>我的交接<ArrowRight size={16}/></button></div>
    {collaboration.slice((taskCurrent-1)*8,taskCurrent*8).map((r:any)=><article className="sales-home-collaboration" key={r.type+':'+r.id}><div><strong>{r.type==='handover'?(r.incoming?'待我接收交接':'等待对方接收交接'):r.title}</strong><p>{r.type==='handover'?`${r.from_name} → ${r.to_name} · ${r.reason}`:`${r.order_number} · 负责人：${r.owner_name}${r.mine?'（我）':''}`}</p>{r.type==='task'&&<><p>下一步：{r.next_action||'待补充'}</p><p className={r.due&&r.due<data.today?'followup-danger':'small muted'}>期限：{r.due||'未安排'}{r.due&&r.due<data.today?' · 已逾期':''} · 下次跟进：{r.next_date||'未安排'}</p></>}</div><button onClick={()=>navigate(r.type==='handover'?'我的交接':'订单跟单')}>前往处理<ArrowRight size={16}/></button></article>)}
    {!collaboration.length&&<p className="sales-home-empty">当前没有待接收交接或未完成的协作任务。</p>}<Pager count={collaboration.length} page={taskCurrent} setPage={TP}/>
   </section>
   <section className="panel" aria-labelledby="sales-home-performance-title"><h2 id="sales-home-performance-title">个人业绩 <span className="small muted">{data.month}</span></h2><dl className="sales-home-performance"><div><dt>已确认成交单</dt><dd>{data.performance.deals} 单</dd></div><div><dt>已核实合同金额</dt><dd>{amount(data.performance.contracts)}</dd></div><div><dt>当月登记到账</dt><dd>{amount(data.performance.receipts)}</dd></div><div><dt>当月登记退款</dt><dd>{amount(data.performance.refunds)}</dd></div></dl><p className="small muted">按成交单记录的业务员归属统计，撤销记录不计入；合同按成交月份、到账和退款各按发生月份统计，币种分别展示。{data.performance.unpriced>0?`${data.performance.unpriced} 单合同金额待核实。`:''} 尚未接入个人目标，不计算达成率。</p></section>
  </>}
 </div>;
}
