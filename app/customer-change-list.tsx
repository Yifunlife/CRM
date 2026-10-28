'use client';
const value=(entry:any,side:'before'|'after')=>{
 const v=entry.payload[side];if(entry.payload.field==='grade')return v||'未评级';if(entry.payload.field==='status')return v||'—';
 if(entry.kind==='核查咨询有效性')return v?.state||'待核查';
 return v?.source_kind==='广告活动'?'广告活动（名称待核查）':v?.source_kind||'未知来源';
};
export default function CustomerChangeList({changes,openLead,campaigns=[]}:{changes:any[];openLead?:(id:string)=>void;campaigns?:any[]}){
 const display=(entry:any,side:'before'|'after')=>{const v=entry.payload[side];return v?.source_kind==='广告活动'?(entry[side+'_campaign_name']||campaigns.find(c=>c.id===v.campaign_id)?.name||value(entry,side)):value(entry,side);};
 return <><p className="small muted">最近200条变化。分类与跟进状态从本次功能启用后开始留痕；历史变化不补造。有效性与来源显示已有核查记录。</p>{!changes.length?<p>暂无可见的变化记录。</p>:<><p className="small muted customer-change-scroll-hint">左右滑动查看原值、新值和修改人。</p><div className="table-wrap" role="region" aria-label="客户变化记录，可左右滚动" tabIndex={0}><table className="customer-change-table"><thead><tr>{['时间（北京）','客户','变化内容','原值','新值','修改人／依据'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{changes.map(e=><tr key={e.id}><td>{new Date(e.created).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</td><td>{openLead?<button className="text" onClick={()=>openLead(e.entity_id)}>{e.customer_name}</button>:e.customer_name}</td><td>{e.kind}</td><td>{display(e,'before')}</td><td>{display(e,'after')}</td><td>{e.actor_name}<div className="small muted">{e.payload.reason||e.payload.after?.reason||'—'}</div></td></tr>)}</tbody></table></div></>}</>;
}
