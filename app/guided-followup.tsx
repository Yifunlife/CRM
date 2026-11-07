'use client';
import {useState} from 'react';
import {CONTACT_ACTIONS,addDays,day} from '../lib/personal-work';
import {CUSTOMER_FOLLOW_STATUSES} from '../lib/customer-profile';
export const BLOCKERS=['等待客户回复','需求尚未明确','场地 / 图纸未提供','预算未确定','方案待调整','报价 / 价格异议','决策人未确认','合同 / 付款待确认','内部协作待处理','其他（见额外备注）'];
export default function GuidedFollowup({profile,nextDate,editing}:{profile:any;nextDate:string;editing:boolean}){
 const [date,D]=useState(nextDate||'');
 function choice(name:string,label:string,value:string,options:readonly string[],empty='请选择') {return <label>{label}<select name={name} defaultValue={value||''} disabled={!editing}><option value="">{empty}</option>{value&&!options.includes(value)&&<option value={value}>{value}（原记录）</option>}{options.map(v=><option key={v}>{v}</option>)}</select></label>;}
 return <div className="dossier-grid dossier-guided">
  {choice('profile_nextAction','下一步做什么',profile.nextAction,CONTACT_ACTIONS,'暂未安排')}
  {choice('profile_followStatus','目前在等什么 / 跟进状态',profile.followStatus,CUSTOMER_FOLLOW_STATUSES,'待确认')}
  <div className="dossier-date-choice"><label>什么时候跟进（北京时间）<input type="date" name="next_date" value={date} readOnly={!editing} onChange={e=>D(e.target.value)}/></label>{editing&&<div className="dossier-date-buttons" role="group" aria-label="快速选择跟进日期">{[[0,'今天'],[1,'明天'],[3,'3天后'],[7,'7天后']].map(([n,label])=><button type="button" key={n} aria-pressed={date===addDays(day(),Number(n))} onClick={()=>D(addDays(day(),Number(n)))}>{label}</button>)}<button type="button" onClick={()=>D('')}>暂不安排</button></div>}</div>
  {choice('profile_blocker','手动标注卡点',profile.blocker,BLOCKERS,'未标注卡点')}
  {choice('profile_reviewStatus','资料核查情况',profile.reviewStatus,['待核实','已核实','需要协助'],'待确认')}

  <label className="dossier-full">额外备注（选填）<textarea name="profile_followNote" defaultValue={profile.followNote} readOnly={!editing} maxLength={6000} rows={2} placeholder="有特殊情况或其他卡点时再补充"/></label>
 </div>;
}
