'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,ChevronLeft,ChevronRight,X} from 'lucide-react';
import {FOLLOWUP_NODES,PROCESS_STATUSES,processSummary} from '../lib/followup-board';
import {PROCESS_FIELDS} from '../lib/role-workspace';
import {orderReminders,orderToday} from '../lib/order-followup';
import './followup-timeline.css';

type Props={filters:ReactNode;orders:any[];tasks:any[];people:any[];canEdit:boolean;demo:boolean;api:(path:string,body?:any)=>Promise<any>;onSaved:(order:any)=>void;selected:string;onNode:(id:string,page:string)=>void;onClose:()=>void;renderNode:(order:any)=>ReactNode};
type Draft={start:string;due:string;owner_id:string;status:string;next:string;completed:string};
type Selection={id:string;page:string;chooser:boolean;anchor:HTMLElement|null};
const day=(s:string)=>Date.parse(s+'T00:00:00Z');
const shortNames=['接单','生产','出货','单证','提单','对账','收款'];
export default function FollowupTimeline({filters,orders,tasks,people,canEdit,demo,api,onSaved,selected,onNode,onClose,renderNode}:Props){
 const today=orderToday(),[year,Y]=useState(Number(today.slice(0,4))),[month,MO]=useState(Number(today.slice(5,7))-1);
 const [selection,SELECT]=useState<Selection|null>(null),[detail,D]=useState<any>(null),[draft,F]=useState<Draft|null>(null),[eligiblePeople,OP]=useState<any[]>([]),[initialStatus,INITIAL]=useState('');
 const [busy,B]=useState(false),[loading,L]=useState(false),[error,E]=useState(''),[message,M]=useState(''),[revision,READ]=useState(0),[needsReload,RELOAD]=useState(false),[backup,BACKUP]=useState<Draft|null>(null),[position,POSITION]=useState({left:12,top:60});
 const root=useRef<HTMLElement>(null),popup=useRef<HTMLElement>(null),form=useRef<HTMLFormElement>(null),returnFocus=useRef<HTMLElement|null>(null);
 const order=selection&&orders.find(o=>o.id===selection.id),node=FOLLOWUP_NODES.find(n=>n.page===selection?.page),editable=!!canEdit&&!order?.archived;
 useEffect(()=>{if(!selection){D(null);F(null);root.current?.style.removeProperty('min-height');return;}let live=true;D(null);F(null);E('');L(true);
  const request=demo||!editable?Promise.resolve({order,owners:people}):api('followup/orders/'+selection.id+'/schedule');
  request.then(d=>{if(!live)return;if(!d.order)throw Error('项目不存在，请重新选择');const previous=d.order.details.business_process?.[selection.page]||{},status=previous.status||processSummary(d.order,FOLLOWUP_NODES.find(n=>n.page===selection.page)!,tasks).status;
   D(d.order);OP(d.owners||[]);INITIAL(PROCESS_STATUSES.includes(status)?status:'未开始');F({start:previous.start||'',due:previous.due||'',owner_id:previous.owner_id||d.order.logistics_id,status:PROCESS_STATUSES.includes(status)?status:'未开始',next:previous.next||'',completed:previous.completed||''});RELOAD(false);
  }).catch(e=>{if(live){E(e.message);RELOAD(true);}}).finally(()=>{if(live)L(false);});return()=>{live=false;};
 },[selection?.id,selection?.page,demo,editable,api,revision]);
 function close(){if(busy)return;SELECT(null);BACKUP(null);E('');returnFocus.current?.focus({preventScroll:true});}
 function open(id:string,page:string,anchor:HTMLElement,chooser=false){if(busy)return;returnFocus.current=anchor;BACKUP(null);M('');SELECT({id,page,anchor,chooser});}
 useEffect(()=>{if(!selection)return;function place(){const r=root.current,p=popup.current;if(!r||!p)return;const bounds=r.getBoundingClientRect(),anchor=selection!.anchor?.isConnected?selection!.anchor.getBoundingClientRect():bounds;r.style.minHeight=Math.max(r.offsetHeight,p.offsetHeight+24)+'px';const next={left:Math.max(8,Math.min(anchor.left-bounds.left,r.clientWidth-p.offsetWidth-8)),top:Math.max(8,Math.min(anchor.bottom-bounds.top+6,r.offsetHeight-p.offsetHeight-8))};POSITION(old=>old.left===next.left&&old.top===next.top?old:next);}
  const outside=(e:PointerEvent)=>{if(!busy&&e.target instanceof Node&&!popup.current?.contains(e.target)&&!selection.anchor?.contains(e.target))close();};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy){e.preventDefault();close();}};
  place();window.addEventListener('resize',place);document.addEventListener('scroll',place,true);document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{window.removeEventListener('resize',place);document.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[selection,loading,error,draft?.status,busy]);
 useEffect(()=>{if(draft&&!loading)form.current?.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true});},[selection?.id,selection?.page,loading]);
 async function save(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(!selection||!detail||!draft||!editable||needsReload||busy)return;
  if(!!draft.start!==!!draft.due){E('开始与完成日期请同时填写，或都留空');return;}if(draft.start&&draft.due<draft.start){E('完成日期不能早于开始日期');return;}
  const previous=detail.details.business_process?.[selection.page]||{},changed=draft.status!==initialStatus,id=detail.id;let committed=false;B(true);E('');M('');
  try{let updated;
   if(demo){
    if(changed&&!draft.next.trim())throw Error('请填写下一步与处理安排');
    if(changed&&draft.status==='已完成'){
     if(selection.page==='跟进收款')throw Error('收款归档须通过原收款确认及订单归档流程完成');
     if(!draft.completed)throw Error('请填写实际完成日期');if(draft.completed>today)throw Error('实际完成日期不能在未来');
     if(PROCESS_FIELDS[selection.page].some(k=>!previous.values?.[k]))throw Error('完成本环节前请填写全部核对项，不适用的内容请注明原因');
     if(previous.customer_needs_sync)throw Error('完成本环节前，请同步客户并记录沟通依据');
    }
    const plan={...previous,start:draft.start,due:draft.due,owner_id:draft.owner_id,schedule_only:previous.schedule_only??!(previous.at||previous.status||previous.next||Object.keys(previous.values||{}).length),original_start:previous.original_start||previous.start||draft.start,original_due:previous.original_due||previous.due||draft.due,...(changed?{status:draft.status,next:draft.next,completed:draft.status==='已完成'?draft.completed:'',schedule_only:false}: {})};
    updated={...detail,version:detail.version+1,details:{...detail.details,business_process:{...detail.details.business_process,[selection.page]:plan}}};
   }else{
    if(changed)await api('followup/orders/'+id+'/business-process',{version:detail.version,page:selection.page,purchase_kind:detail.details.purchase_kind||'project',business_stage:detail.details.business_stage,status:draft.status,start:draft.start,due:draft.due,owner_id:draft.owner_id,next:draft.next,completed:draft.status==='已完成'?draft.completed:'',values:previous.values||{}});
    else await api('followup/orders/'+id+'/schedule',{version:detail.version,node:{page:selection.page,start:draft.start,due:draft.due,owner_id:draft.owner_id}});
    committed=true;updated=(await api('followup/orders/'+id+'/schedule')).order;
   }
   onSaved(updated);M(demo?'示例环节已更新，仅本次预览有效。':'本环节已保存，甘特图已更新。');SELECT(null);BACKUP(null);
  }catch(e:any){if(committed||e.status===409){BACKUP({...draft});RELOAD(true);}E(committed?'本环节已保存，但最新资料读取失败。请重新读取后核对。':e.message);}finally{B(false);}
 }
 if(selected){const selectedOrder=orders.find(o=>o.id===selected);return <section className="ft-page"><div className="fb-toolbar">{filters}</div><button onClick={onClose}><ArrowLeft size={16}/>返回甘特图</button>{selectedOrder&&renderNode(selectedOrder)}</section>;}
 const start=Date.UTC(year,month,1),end=Date.UTC(year,month+1,1),days=Math.round((end-start)/86400000),pct=(t:number)=>100*(t-start)/(end-start),now=pct(day(today)+43200000);
 const ticks=Array.from({length:days},(_,i)=>{const at=start+i*86400000;return{at,label:i+1,weekend:[0,6].includes(new Date(at).getUTCDay()),today:at===day(today)};});
 const grid=<>{ticks.map(t=><span key={t.at} className={'ft-day-grid'+(t.weekend?' ft-weekend':'')} aria-hidden="true" style={{left:pct(t.at)+'%',width:100/days+'%'}}/>)}{now>=0&&now<=100&&<span className="ft-today" aria-hidden="true" style={{left:now+'%'}}/>}</>;
 function shift(n:number){if(busy)return;const d=new Date(Date.UTC(year,month+n,1));Y(d.getUTCFullYear());MO(d.getUTCMonth());SELECT(null);}
 const reminders=orders.flatMap(o=>orderReminders(o,tasks.filter(t=>t.order_id===o.id),today).map(r=>({...r,order:o}))).sort((a,b)=>Number(b.overdue)-Number(a.overdue)||a.due.localeCompare(b.due));
 return <section className="ft-page ft-inline" ref={root} aria-label="项目跟进甘特图">
  <div className="ft-toolbar">{filters}<label className="ft-year"><span>年份</span><input aria-label="甘特图年份" type="number" min="2000" max="2100" value={year} disabled={busy} onChange={e=>{const n=Number(e.target.value);if(n>=2000&&n<=2100)Y(n);}}/></label><div className="ft-month-controls"><button disabled={busy} aria-label="上个月" onClick={()=>shift(-1)}><ChevronLeft size={15}/></button><label className="ft-month"><span>月份</span><select aria-label="甘特图月份" value={month} disabled={busy} onChange={e=>MO(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i} value={i}>{i+1}月</option>)}</select></label><button disabled={busy} aria-label="下个月" onClick={()=>shift(1)}><ChevronRight size={15}/></button><button disabled={busy} onClick={()=>{Y(Number(today.slice(0,4)));MO(Number(today.slice(5,7))-1);}}>今天</button></div>{canEdit&&<button className="primary ft-schedule-button" disabled={busy||!orders.some(o=>!o.archived)} onClick={e=>{const o=orders.find(o=>!o.archived);if(o)open(o.id,FOLLOWUP_NODES.find(n=>!o.details.business_process?.[n.page]?.start)?.page||FOLLOWUP_NODES[0].page,e.currentTarget,true);}}>项目排期</button>}</div>
  {message&&<p className="notice success ft-message" role="status">{message}</p>}
  <div className="ft-scroll" role="region" aria-label="项目甘特图，可横向滚动" tabIndex={0}><div className="ft-grid" style={{minWidth:220+days*23}}><div className="ft-row ft-axis"><div className="ft-label">项目 / 负责人 / 当前进度</div><div className="ft-track"><div className="ft-calendar-month">{year}年{month+1}月 · 日历天</div><div className="ft-days" style={{gridTemplateColumns:`repeat(${days},minmax(0,1fr))`}}>{ticks.map(t=><span className={(t.weekend?'ft-weekend ':'')+(t.today?'ft-current-day':'')} key={t.at}>{t.label}</span>)}</div></div></div>
   {orders.map(o=>{const ends:number[]=[],lanes:Record<string,number>={},saved=o.details.business_process||{},states=FOLLOWUP_NODES.map(n=>processSummary(o,n,tasks)),warning=states.findIndex(s=>s.warning),current=warning>=0?warning:states.findIndex(s=>!['已完成','不适用'].includes(s.status));
    const missing=FOLLOWUP_NODES.filter(n=>!saved[n.page]?.start&&!saved[n.page]?.due),scheduled=FOLLOWUP_NODES.map((n,i)=>({...n,i,from:saved[n.page]?.start||saved[n.page]?.due,to:saved[n.page]?.due||saved[n.page]?.start})).filter(n=>n.from&&day(n.from)<end&&day(n.to)>=start).sort((a,b)=>day(a.from)-day(b.from)||a.i-b.i);
    const points=new Map<string,typeof scheduled>(),plotted=scheduled.filter(n=>{if(n.from!==n.to)return true;const group=points.get(n.from);if(group){group.push(n);return false;}points.set(n.from,[n]);return true;});
    for(const n of plotted){let lane=ends.findIndex(v=>v<day(n.from));if(lane<0)lane=ends.length;ends[lane]=day(n.to);lanes[n.page]=lane;}
    return <div className="ft-row ft-project" key={o.id} style={{minHeight:Math.max(64,18+ends.length*28)}}><div className="ft-label"><strong>{o.project}</strong><small>{people.find(p=>p.id===states[Math.max(0,current)].owner_id)?.name||states[Math.max(0,current)].owner_name||o.logistics_name||'负责人待明确'} · {current<0?'全部完成':FOLLOWUP_NODES[current].label}</small><small className="ft-project-progress">已完成 {states.filter(s=>['已完成','不适用'].includes(s.status)).length}/7 环节{missing.length>0&&<button disabled={busy} onClick={e=>open(o.id,missing[0].page,e.currentTarget,true)}>{missing.length}项未排期</button>}</small></div><div className="ft-track">{grid}{plotted.map(n=>{const a=Math.max(start,day(n.from)),b=Math.min(end,day(n.to)+86400000),span=(b-a)/86400000,group=n.from===n.to?points.get(n.from):undefined,cluster=!!group&&group.length>1,state=cluster?group!.map(n=>states[n.i]).sort((a,b)=>['error','wait','active','pending','done'].indexOf(a.tone)-['error','wait','active','pending','done'].indexOf(b.tone))[0]:states[n.i],caption=o.project+' · '+(cluster?group!.map(n=>n.label).join('、'):n.label)+' · '+state.status+(state.warning?' · '+state.warning:'')+' · '+n.from+' 至 '+n.to;return <button key={n.page} className={'ft-bar ft-tone-'+state.tone+(span<3?' ft-short':'')} style={{left:pct(a)+'%',width:(pct(b)-pct(a))+'%',top:9+lanes[n.page]*28}} aria-label={caption} title={caption} aria-haspopup="dialog" aria-expanded={selection?.id===o.id&&selection?.page===n.page} disabled={busy} onClick={e=>open(o.id,n.page,e.currentTarget,cluster)}>{cluster?'×'+group!.length:span<3?shortNames[n.i]:n.label}</button>;})}{!scheduled.length&&(missing.length?<button disabled={busy} className="ft-unscheduled" onClick={e=>open(o.id,missing[0].page,e.currentTarget,true)}>待排期 · 点击设置</button>:<span className="ft-no-month">本月无排期</span>)}</div></div>;
   })}</div>{!orders.length&&<p className="empty">暂无符合条件的项目。</p>}</div>
  <div className="ft-footer"><div className="ft-legend">{[['done','已完成'],['active','进行中'],['pending','未开始'],['wait','待确认'],['error','异常 / 逾期']].map(([tone,label])=><span key={tone}><i className={'ft-tone-'+tone}/>{label}</span>)}<span>今天 {today}</span></div><span className="small muted">点击时间条，直接查看或编辑该环节</span></div>
  {reminders.length>0&&<details className="ft-reminders"><summary>需要跟进 · {reminders.length} 项</summary>{reminders.map((r,i)=><button key={r.order.id+r.key+i} className="ft-reminder" onClick={e=>open(r.order.id,r.page||FOLLOWUP_NODES.find(n=>n.step===tasks.find(t=>t.id===r.key)?.step)?.page||(/factory/.test(r.key)?'生产跟进':'出货交付'),e.currentTarget)}><span><strong>{r.order.project}</strong><span className={r.overdue?'followup-danger':''}>{r.title}</span></span><span>{r.due}<ChevronRight size={15}/></span></button>)}</details>}
  {selection&&<section className="ft-inline-popup" style={position} ref={popup} role="dialog" aria-labelledby="ft-popup-title"><div className="ft-popup-heading"><h2 id="ft-popup-title">{node?.label}</h2><button disabled={busy} aria-label="关闭环节编辑" onClick={close}><X size={16}/></button></div><p className="small muted ft-popup-project">{order?.project}</p>
   {selection.chooser&&<div className="ft-popup-picker"><label>项目<select aria-label="选择项目" disabled={busy} value={selection.id} onChange={e=>{BACKUP(null);SELECT({...selection,id:e.target.value});}}>{orders.map(o=><option key={o.id} value={o.id}>{o.project}</option>)}</select></label><label>环节<select aria-label="选择环节" disabled={busy} value={selection.page} onChange={e=>{BACKUP(null);SELECT({...selection,page:e.target.value});}}>{FOLLOWUP_NODES.map(n=><option key={n.page} value={n.page}>{n.label}</option>)}</select></label></div>}
   {loading&&<p role="status">正在读取本环节…</p>}{error&&<p className="notice error" role="alert">{error}</p>}{needsReload&&<button disabled={loading||busy} onClick={()=>READ(v=>v+1)}>重新读取项目资料</button>}{backup&&<details className="ft-backup"><summary>本次填写备份</summary><p>{backup.start||'未排期'} 至 {backup.due||'未排期'} · {backup.status}</p><p>{people.find(p=>p.id===backup.owner_id)?.name} · {backup.next}</p></details>}
   {draft&&detail&&<form ref={form} onSubmit={save}><fieldset disabled={busy||loading||!editable||needsReload}><div className="ft-popup-fields"><label>计划开始<input type="date" value={draft.start} onChange={e=>F({...draft,start:e.target.value})}/></label><label>计划完成<input type="date" value={draft.due} onChange={e=>F({...draft,due:e.target.value})}/></label><label>负责人<select aria-label="环节负责人" value={draft.owner_id} onChange={e=>F({...draft,owner_id:e.target.value})}>{!eligiblePeople.some(p=>p.id===draft.owner_id)&&<option value={draft.owner_id}>{people.find(p=>p.id===draft.owner_id)?.name||'原负责人'}</option>}{eligiblePeople.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>状态<select aria-label="环节状态" value={draft.status} onChange={e=>F({...draft,status:e.target.value})}>{PROCESS_STATUSES.filter(s=>s!=='不适用'||!['接单确认','出货交付','跟进收款'].includes(selection.page)).map(s=><option key={s}>{s}</option>)}</select></label></div>
    {draft.status!==initialStatus&&<><label>下一步与处理安排<input required maxLength={2000} value={draft.next} onChange={e=>F({...draft,next:e.target.value})}/></label>{draft.status==='已完成'&&<label>实际完成日期<input type="date" required max={today} value={draft.completed} onChange={e=>F({...draft,completed:e.target.value})}/></label>}</>}
    <div className="ft-popup-actions">{editable&&<button type="button" onClick={()=>F({...draft,start:'',due:''})}>清空日期</button>}<button type="button" onClick={close}>取消</button>{editable&&<button className="primary" type="submit">{busy?'正在保存…':'保存'}</button>}</div></fieldset></form>}
   {!loading&&<button className="text ft-node-record" disabled={busy} onClick={()=>{SELECT(null);BACKUP(null);onNode(selection.id,selection.page);}}>查看本环节核对记录</button>}
  </section>}
 </section>;
}
