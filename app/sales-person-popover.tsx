'use client';
import {useEffect,useState,type ReactElement} from 'react';
import {Popover,PopoverTrigger,PopoverContent} from '../components/ui/popover';
import {moneyLabel,PROJECT_STAGES} from '../lib/sales-suite';
import StatusBadge from './status-badge';
import './sales-person-popover.css';

type Project={key:string;name:string;customer:string;stage:string;quote:string;deal?:any;open:()=>void};
type Props={open:boolean;onOpenChange:(open:boolean)=>void;name:string;market:string;cycle:string;newCount:number;dealCount:number;goal?:any;amounts:Record<string,number>;unverified?:boolean;rows:Project[];stage:string;onStageChange:(stage:string)=>void;children:ReactElement;readOnly?:boolean;amountLabel?:string;periodAmounts?:Record<string,number>};
const stages=Object.fromEntries(PROJECT_STAGES);
export default function SalesPersonPopover({open,onOpenChange,name,market,cycle,newCount,dealCount,goal:g,amounts,unverified=false,rows,stage,onStageChange,children,readOnly=false,amountLabel='已成交金额',periodAmounts}:Props){
 const [page,P]=useState(0),pages=Math.max(1,Math.ceil(rows.length/5)),current=Math.min(page,pages-1);
 useEffect(()=>{P(0);},[open,stage]);
 const rate=g?.rate!=null?(g.rate*100).toFixed(1)+'%':g?.unverified?'金额待核实':g?.target===0?'目标为 0':'未设目标';
 return <Popover open={open} onOpenChange={onOpenChange}><PopoverTrigger asChild>{children}</PopoverTrigger><PopoverContent className="so-person-popover" side="top" align="end" sideOffset={8} collisionPadding={12} aria-label={name+'业务明细'}>
  <div className="so-popover-heading"><div><h2>{name}</h2><p>{market} · {cycle}</p></div><button type="button" onClick={()=>onOpenChange(false)} aria-label="关闭业务员明细">关闭</button></div>
  <div className="so-popover-money">
   {g&&<><div className="so-popover-completion"><span>目标完成</span><strong>{rate}</strong></div><div className="so-popover-track" aria-hidden="true"><span style={{width:Math.min(100,Math.max(0,g.rate||0)*100)+'%'}}/></div></>}
   <dl>{g&&<div><dt>目标金额</dt><dd>{g.target==null?'未设置':moneyLabel(g.target,g.currency)}</dd></div>}<div><dt>{amountLabel}{g?.unverified||unverified?'（已核实部分）':''}</dt><dd>{g?moneyLabel(g.actual,g.currency):Object.keys(amounts).length?Object.entries(amounts).map(([c,n])=><span key={c}>{moneyLabel(n,c)}</span>):'暂无登记'}</dd></div>{g&&<div><dt>{g.target!=null&&g.actual>g.target?'超出目标':'待完成金额'}</dt><dd>{g.target==null||g.unverified?'—':moneyLabel(Math.abs(g.target-g.actual),g.currency)}</dd></div>}{periodAmounts&&<div><dt>{cycle}成交金额</dt><dd>{Object.keys(periodAmounts).length?Object.entries(periodAmounts).map(([c,n])=><span key={c}>{moneyLabel(n,c)}</span>):'暂无登记'}</dd></div>}</dl>
  </div>
  <p className="so-popover-context">{cycle}新增客户 {newCount} 位 · 成交项目 {dealCount} 个{g?.unverified||unverified?' · 部分金额待核实':''}</p>
  <div className="so-popover-project-heading"><h3>项目明细 {rows.length} 个</h3><label>阶段<select aria-label="项目阶段" value={stage} onChange={e=>onStageChange(e.target.value)}><option value="全部">全部</option>{PROJECT_STAGES.map(([v,n])=><option value={v} key={v}>{n}</option>)}</select></label></div>
  {rows.length?<div className="so-popover-project-list"><table aria-label={name+'项目明细'}><thead><tr><th>客户／项目</th><th>阶段</th><th>金额</th></tr></thead><tbody>{rows.slice(current*5,current*5+5).map(p=><tr key={p.key}><td>{readOnly?<span>{p.name}</span>:<button type="button" className="text" onClick={()=>{onOpenChange(false);p.open();}}>{p.name}</button>}<small>{p.customer}</small></td><td><StatusBadge value={stages[p.stage]||p.stage}/></td><td>{p.deal?(p.deal.total_minor==null?'待核实':moneyLabel(p.deal.total_minor,p.deal.currency)):p.quote}<small>{p.deal?'成交金额':'报价金额'}</small></td></tr>)}</tbody></table></div>:<p className="so-popover-empty">当前阶段暂无项目。</p>}
  {pages>1&&<div className="so-popover-pagination"><button type="button" disabled={!current} onClick={()=>P(current-1)}>上一页</button><span>{current+1} / {pages}</span><button type="button" disabled={current===pages-1} onClick={()=>P(current+1)}>下一页</button></div>}
 </PopoverContent></Popover>;
}
