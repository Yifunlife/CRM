import {reportCountry} from './report-country';
import {reportDay} from './operations-report';
export function customerMarket(l:any):string{
 if(l.business_scope==='alibaba'||/阿里|alibaba/i.test(l.source||''))return '外贸';
 const country=reportCountry(l.country);
 if(country.code==='CN')return '内贸';
 if(country.code)return '外贸';
 if(l.business_scope==='douyin-local'||/抖音|小红书|视频号/.test(l.source||''))return '内贸';
 return '待确认';
}
export function acquisitionDashboard({report,leads,campaigns,subjects,deals,notes,assignments,contracts,receipts,refunds,outcomes}:any){
 const links=new Map(subjects.map((s:any)=>[s.lead_id,s.subject_id]));
 const grouped=new Map<string,any[]>();
 for(const l of leads){const key=links.has(l.id)?'subject:'+links.get(l.id):'lead:'+l.id;grouped.set(key,[...(grouped.get(key)||[]),l]);}
 const add=(map:Record<string,number>,currency:string,amount:number)=>{map[currency]=(map[currency]||0)+amount;};
 const customers=report.customers.map((c:any)=>{
  const members=grouped.get(c.key)||[],first=members.find((l:any)=>l.id===c.lead_id),ids=new Set(members.map((l:any)=>l.id));
  const validDeals=deals.filter((d:any)=>ids.has(d.lead_id)&&!d.cancelled&&d.deal_date>=c.acquired&&d.deal_date<=report.as_of),dealIds=new Set(validDeals.map((d:any)=>d.id));
  const money:Record<string,number>={},cash:Record<string,number>={};let missingContracts=0;
  for(const d of validDeals){const contract=contracts.find((x:any)=>x.deal_id===d.id);if(contract)add(money,contract.currency,contract.total_minor);else missingContracts++;}
  for(const r of receipts.filter((r:any)=>dealIds.has(r.deal_id)&&!r.cancelled&&r.received_date>=c.acquired&&r.received_date<=report.as_of)){
   const refunded=refunds.filter((f:any)=>f.receipt_id===r.id&&f.refunded_date<=report.as_of).reduce((n:number,f:any)=>n+f.amount_minor,0);add(cash,r.currency,r.amount_minor-refunded);
  }
  const waits:number[]=[];
  for(const l of members){const assigned=assignments.filter((a:any)=>a.lead_id===l.id).sort((a:any,b:any)=>a.created.localeCompare(b.created))[0];if(!assigned)continue;
   const note=notes.filter((n:any)=>n.lead_id===l.id&&n.created>=assigned.created&&reportDay(n.created)<=report.as_of).sort((a:any,b:any)=>a.created.localeCompare(b.created))[0];
   if(note)waits.push((Date.parse(note.created)-Date.parse(assigned.created))/3600000);
  }
  const assigned=members.some((l:any)=>l.owner_id||l.original_owner),overdue=c.quality==='有效'&&!validDeals.length&&members.some((l:any)=>l.status!=='已结束'&&l.next_date&&l.next_date<report.as_of);
  return {...c,source_platform:campaigns.find((p:any)=>p.id===c.source_key)?.platform||first?.source||'来源待确认',source_key:c.source_key==='未知来源'&&first?.source?'raw:'+first.source:c.source_key,country:reportCountry(first?.country).name,orders:validDeals.length,market:customerMarket(first||{}),assigned,overdue,first_hours:waits.length?Math.min(...waits):null,money,cash,missingContracts,loss:!validDeals.length&&members.every((l:any)=>l.status==='已结束')?(outcomes.find((o:any)=>ids.has(o.lead_id))?.reason||'原因未登记'):null};
 });
 const rawSources=[...new Set(customers.filter((c:any)=>c.source_key.startsWith('raw:')).map((c:any)=>c.source_key))].map(key=>({key,label:String(key).slice(4)+'（原始来源·待归因）',currency:'',spent_minor:null,customers:customers.filter((c:any)=>c.source_key===key).length}));
 const channels=[...report.rows,...rawSources].filter((r:any)=>customers.some((c:any)=>c.source_key===r.key)||r.spent_minor!==null).map((r:any)=>{
  const cohort=customers.filter((c:any)=>c.source_key===r.key),markets=[...new Set(cohort.map((c:any)=>c.market))];
  const campaign=campaigns.find((c:any)=>c.id===r.key);
  return {...r,platform:campaign?.platform||cohort[0]?.source_platform||'来源待确认',account_name:campaign?.account_name||'',market:markets.length===1&&markets[0]!=='待确认'?markets[0]:'共用／待确认'};
 });
 const sections=['内贸','外贸','待确认'].map(market=>{
  const cohort=customers.filter((c:any)=>c.market===market),valid=cohort.filter((c:any)=>c.quality==='有效'),hours=cohort.filter((c:any)=>c.first_hours!==null),money:Record<string,number>={},cash:Record<string,number>={},spend:Record<string,number>={},losses:Record<string,number>={};
  for(const c of cohort){for(const [k,v] of Object.entries(c.money))add(money,k,v as number);for(const [k,v] of Object.entries(c.cash))add(cash,k,v as number);if(c.loss)losses[c.loss]=(losses[c.loss]||0)+1;}
  for(const r of channels.filter((r:any)=>r.market===market&&r.spent_minor!==null))add(spend,r.currency,r.spent_minor);
  const countries=[...new Set(cohort.map((c:any)=>c.country))].map(country=>{const cs=cohort.filter((c:any)=>c.country===country),amounts:Record<string,number>={};for(const c of cs)for(const [k,v] of Object.entries(c.money))add(amounts,k,v as number);return {country,customers:cs.length,orders:cs.reduce((n:number,c:any)=>n+c.orders,0),money:amounts};}).sort((a:any,b:any)=>b.orders-a.orders||b.customers-a.customers);
  const platforms=[...new Set(cohort.map((c:any)=>c.source_platform))].map(platform=>{const cs=cohort.filter((c:any)=>c.source_platform===platform),keys=new Set(cs.map((c:any)=>c.source_key)),rs=channels.filter((r:any)=>keys.has(r.key)),money:Record<string,number>={},spend:Record<string,number>={};for(const c of cs)for(const [k,v]of Object.entries(c.money))add(money,k,v as number);for(const r of rs)if(r.market===market&&r.spent_minor!==null)add(spend,r.currency,r.spent_minor);return {platform,customers:cs.length,orders:cs.reduce((n:number,c:any)=>n+c.orders,0),money,spend,shared_spend:rs.some((r:any)=>r.market!==market&&r.spent_minor!==null),missingContracts:cs.reduce((n:number,c:any)=>n+c.missingContracts,0),countries:[...new Set(cs.map((c:any)=>c.country))].map(country=>({country,customers:cs.filter((c:any)=>c.country===country).length})).sort((a:any,b:any)=>b.customers-a.customers)};});
  return {market,platforms,countries,orders:cohort.reduce((n:number,c:any)=>n+c.orders,0),total:cohort.length,valid:valid.length,unchecked:cohort.filter((c:any)=>c.quality==='待核查').length,converted:cohort.filter((c:any)=>c.deals>0).length,valid_converted:valid.filter((c:any)=>c.deals>0).length,unassigned:cohort.filter((c:any)=>!c.assigned).length,uncontacted:cohort.filter((c:any)=>c.assigned&&!c.contacted).length,valid_contacted:valid.filter((c:any)=>c.contacted).length,overdue:cohort.filter((c:any)=>c.overdue).length,first_hours:hours.length?hours.reduce((n:number,c:any)=>n+c.first_hours,0)/hours.length:null,timing_samples:hours.length,money,cash,spend,missingContracts:cohort.reduce((n:number,c:any)=>n+c.missingContracts,0),losses,channels:channels.filter((r:any)=>cohort.some((c:any)=>c.source_key===r.key)).map((r:any)=>{const cs=cohort.filter((c:any)=>c.source_key===r.key),v=cs.filter((c:any)=>c.quality==='有效');const amounts:Record<string,number>={};for(const c of cs)for(const [k,v] of Object.entries(c.money))add(amounts,k,v as number);return {...r,shared_spend:r.market==='共用／待确认'&&r.spent_minor!==null,deal_customers:cs.filter((c:any)=>c.orders>0).length,orders:cs.reduce((n:number,c:any)=>n+c.orders,0),money:amounts,missingContracts:cs.reduce((n:number,c:any)=>n+c.missingContracts,0),customers:cs.length,valid:v.length,converted:v.filter((c:any)=>c.deals>0).length,contacted:cs.filter((c:any)=>c.contacted).length,spent_minor:r.market===market?r.spent_minor:null,cost_per_valid_minor:r.market===market&&r.spent_minor!==null&&v.length?r.spent_minor/v.length:null};})};
 });
 return {sections,shared:channels.filter((r:any)=>r.market==='共用／待确认'&&r.spent_minor!==null)};
}
