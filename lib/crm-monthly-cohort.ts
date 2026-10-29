import {reportAcquiredDay} from './report-acquired-day';
import {reportDay} from './operations-report';
import {customerMarket} from './operations-dashboard';
export type CohortMonth={month:string;market:string;platform:string;customers:number;valid:number;unchecked:number;orders:number;converted:number;money:Record<string,number>;missingContracts:number;unattributed:number;dateFallback:number};
export type MonthlyCohorts={asOf:string;firstMonth:string;rows:CohortMonth[]};
export function crmMonthlyCohort({report,leads,subjects,deals,contracts,campaigns}:any):MonthlyCohorts{
 const links=new Map(subjects.map((s:any)=>[s.lead_id,s.subject_id]));
 const customerKey=(id:string)=>links.has(id)?'subject:'+links.get(id):'lead:'+id;
 const byLead=new Map(leads.map((l:any)=>[l.id,l]));
 const byCustomer=new Map<string,any[]>();
 for(const d of deals){if(d.cancelled||d.deal_date>report.as_of)continue;const key=customerKey(d.lead_id);byCustomer.set(key,[...(byCustomer.get(key)||[]),d]);}
 const byContract=new Map(contracts.map((c:any)=>[c.deal_id,c]));
 const groups=new Map<string,CohortMonth>();
 let firstMonth='';
 for(const c of report.customers){
  const month=c.acquired.slice(0,7);if(!firstMonth||month<firstMonth)firstMonth=month;
  const first:any=byLead.get(c.lead_id),campaign=campaigns.find((p:any)=>p.id===c.source_key);
  const market=customerMarket(first||{}),platform=campaign?.platform||first?.source||'来源待确认',key=JSON.stringify([month,market,platform]);
  if(!groups.has(key))groups.set(key,{month,market,platform,customers:0,valid:0,unchecked:0,orders:0,converted:0,money:{},missingContracts:0,unattributed:0,dateFallback:0});
  const row=groups.get(key)!;row.customers++;if(first?.acquisition_date_fallback)row.dateFallback++;if(c.quality==='有效')row.valid++;else if(c.quality!=='无效')row.unchecked++;
  if(c.source_key==='未知来源')row.unattributed++;
  const orders=(byCustomer.get(c.key)||[]).filter(d=>d.deal_date>=c.acquired);
  row.orders+=orders.length;if(orders.length)row.converted++;
  for(const d of orders){const contract:any=byContract.get(d.id);if(!contract){row.missingContracts++;continue;}row.money[contract.currency]=(row.money[contract.currency]||0)+contract.total_minor;}
 }
 return {asOf:report.as_of,firstMonth,rows:[...groups.values()].sort((a,b)=>a.month.localeCompare(b.month))};
}
export function previousMonth(month:string){const [year,m]=month.split('-').map(Number);return m===1?`${year-1}-12`:`${year}-${String(m-1).padStart(2,'0')}`;}
export function cohortMonthTotal(data:MonthlyCohorts,month:string,market:string,platform:string):CohortMonth|null{
 if(!data.firstMonth||month<data.firstMonth||month>data.asOf.slice(0,7))return null;
 const result:CohortMonth={month,market,platform,customers:0,valid:0,unchecked:0,orders:0,converted:0,money:{},missingContracts:0,unattributed:0,dateFallback:0};
 for(const r of data.rows.filter(r=>r.month===month&&(!market||r.market===market)&&(!platform||r.platform===platform))){
  for(const k of ['customers','valid','unchecked','orders','converted','missingContracts','unattributed','dateFallback'] as const)result[k]+=r[k];
  for(const [currency,value]of Object.entries(r.money))result.money[currency]=(result.money[currency]||0)+value;
 }
 return result;
}

export function monthlyAcquiredLeads(leads:any[],intakeIds:Set<string>){
 return leads.map(l=>{const acquired=intakeIds.has(l.id)?reportDay(l.created):reportAcquiredDay(l.entered);return {...l,entered:acquired||reportDay(l.created),acquisition_date_fallback:!acquired};});
}
