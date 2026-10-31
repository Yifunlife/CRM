import {reportPeriod,inReportPeriod} from './report-period';
import {reportAcquiredDay} from './report-acquired-day';
import {customerMarket} from './operations-dashboard';
import {accountTradeScopes} from './account-classification';

export function salesManagementReport(input:any,params:URLSearchParams,today:string){
 const period=reportPeriod(params,today.slice(0,7)),owner=params.get('owner')||'';
 const year=params.get('target_year')||period.start.slice(0,4);
 if(!/^\d{4}$/.test(year)||Number(year)<2000||Number(year)>9998)throw Error('目标年份无效');
 const people=input.people.filter((p:any)=>!owner||p.id===owner);
 const links=new Map(input.links.map((r:any)=>[r.lead_id,r.subject_id]));
 const key=(id:string)=>links.has(id)?'subject:'+links.get(id):'lead:'+id;
 const leads=new Map<string,any>(input.leads.map((l:any)=>[l.id,l]));
 const groups=new Map<string,any[]>();
 for(const l of input.leads){const k=key(l.id);groups.set(k,[...(groups.get(k)||[]),l]);}
 const dates=new Map<string,string>();
 for(const [k,members] of groups)dates.set(k,members.map(l=>reportAcquiredDay(l.entered)||reportAcquiredDay(l.created)||'').filter(Boolean).sort()[0]||'');
 const currencyFor=(l:any,p:any)=>{
  const scopes=accountTradeScopes(p||{});if(scopes.length===1)return scopes[0]==='domestic'?'CNY':'USD';
  const detail=JSON.parse(l?.detail||'{}'),market=detail._sales_company?'外贸':customerMarket(l||{});
  if(market!=='待确认')return market==='内贸'?'CNY':'USD';
  return '';
 };
 const valid=input.deals.filter((d:any)=>!d.cancelled).sort((a:any,b:any)=>a.deal_date.localeCompare(b.deal_date)||a.created.localeCompare(b.created)||a.id.localeCompare(b.id));
 const first=new Map<string,string>();for(const d of valid)if(!first.has(key(d.lead_id)))first.set(key(d.lead_id),d.id);
 const receipts=new Map<string,any[]>();for(const r of input.receipts){if(r.cancelled)continue;receipts.set(r.deal_id,[...(receipts.get(r.deal_id)||[]),r]);}
 const details=valid.filter((d:any)=>!owner||d.owner_id===owner).map((d:any)=>{
  const p=input.people.find((p:any)=>p.id===d.owner_id),l=leads.get(d.lead_id),expected=currencyFor(l,p),rs=receipts.get(d.id)||[];
  const mismatch=!!d.currency&&expected!==d.currency||rs.some(r=>r.currency!==d.currency);
  const net=rs.filter(r=>r.currency===d.currency).reduce((n,r)=>n+r.amount_minor-(r.refunded_minor||0),0);
  return {...d,owner_name:p?.name||'原业务员',customer_name:l?.name||'原客户',group_currency:expected,customer_type:first.get(key(d.lead_id))===d.id?'新客户':'老客户',currency_mismatch:mismatch,received_minor:!d.currency||mismatch?null:net,outstanding_minor:d.total_minor==null||mismatch?null:d.total_minor-net};
 });
 const selected=details.filter((d:any)=>inReportPeriod(d.deal_date,period));
 const summaries=people.flatMap((p:any)=>{
  const currencies=new Set<string>(accountTradeScopes(p).map(s=>s==='domestic'?'CNY':'USD'));
  for(const d of details.filter((d:any)=>d.owner_id===p.id))currencies.add(d.group_currency);
  const owned=input.leads.filter((l:any)=>l.owner_id===p.id);for(const l of owned)currencies.add(currencyFor(l,p));
  for(const t of input.targets.filter((t:any)=>t.owner_id===p.id))currencies.add(t.currency);
  if(!currencies.size)currencies.add('');
  return [...currencies].map(currency=>{
   const ds=selected.filter((d:any)=>d.owner_id===p.id&&d.group_currency===currency),known=ds.filter((d:any)=>d.total_minor!=null&&!d.currency_mismatch&&d.currency===currency);
   const ownKeys=new Set<string>(owned.filter((l:any)=>currencyFor(l,p)===currency).map((l:any)=>key(l.id)));
   const newKeys=[...ownKeys].filter(k=>inReportPeriod(dates.get(k),period));
   const oldKeys=[...ownKeys].filter(k=>valid.some((d:any)=>key(d.lead_id)===k&&d.deal_date<period.start));
   const effective=[...ownKeys].filter(k=>groups.get(k)!.some(l=>l.owner_id===p.id&&l.grade==='A'));
   const total=known.reduce((n:number,d:any)=>n+d.total_minor,0),unverified=ds.length-known.length;
   const target=input.targets.find((t:any)=>t.owner_id===p.id&&t.currency===currency&&t.period===period.kind&&t.period_start===period.start);
   const targetMinor=target?.amount_minor??null;
   const annual=Array.from({length:12},(_,i)=>details.filter((d:any)=>d.owner_id===p.id&&d.group_currency===currency&&!d.currency_mismatch&&d.currency===currency&&d.total_minor!=null&&d.deal_date.startsWith(year+'-'+String(i+1).padStart(2,'0'))).reduce((n:number,d:any)=>n+d.total_minor,0));
   const annualTarget=input.targets.find((t:any)=>t.owner_id===p.id&&t.currency===currency&&t.period==='year'&&t.period_start===year+'-01-01')?.amount_minor??null;
   const annualTotal=annual.reduce((n:number,v:number)=>n+v,0),annualUnverified=details.filter((d:any)=>d.owner_id===p.id&&d.group_currency===currency&&d.deal_date.startsWith(year+'-')&&(d.total_minor==null||d.currency_mismatch||d.currency!==currency)).length;
   return {id:p.id,name:p.name,active:p.active,currency,annual_target_minor:annualTarget,annual_total_minor:annualTotal,annual_unverified:annualUnverified,annual_completion:annualTarget>0&&!annualUnverified?annualTotal/annualTarget:null,new_customers:newKeys.length,effective_customers:effective.length,old_customers:oldKeys.length,deals:ds.length,total_minor:total,new_minor:known.filter((d:any)=>d.customer_type==='新客户').reduce((n:number,d:any)=>n+d.total_minor,0),old_minor:known.filter((d:any)=>d.customer_type==='老客户').reduce((n:number,d:any)=>n+d.total_minor,0),received_minor:known.reduce((n:number,d:any)=>n+d.received_minor,0),outstanding_minor:known.reduce((n:number,d:any)=>n+Math.max(0,d.outstanding_minor),0),overpaid_minor:known.reduce((n:number,d:any)=>n+Math.max(0,-d.outstanding_minor),0),unverified,target_minor:targetMinor,completion:targetMinor>0&&!unverified?total/targetMinor:null,annual,targets:input.targets.filter((t:any)=>t.owner_id===p.id&&t.currency===currency&&t.period_start.startsWith(year))};
  });
 });
 return {period,target_year:year,people:input.people.map(({id,name,active}:any)=>({id,name,active})),rows:summaries,details:selected};
}
