import {reportCountry,countryLabel} from './report-country';

export const REGION_GRADES=['A','B','C','other'] as const;
type Grade=typeof REGION_GRADES[number];
export type RegionCount={key:string;name:string;total:number;grades:Record<Grade,number>};
export type CustomerGeography={kind:'city'|'country';total:number;grades:Record<Grade,number>;top:RegionCount[];other:number;unknown:number};
const emptyGrades=():Record<Grade,number>=>({A:0,B:0,C:0,other:0});
const missing=new Set(['','待补充','待确认','未知','未填写','不详','unknown','null','n/a','—','-']);

// Reporting aliases never overwrite a customer's original country or city.
export function customerGeography(leads:{country?:string;grade?:string;lead_detail?:string}[],kind:'city'|'country'):CustomerGeography{
 const regions=new Map<string,RegionCount>(),grades=emptyGrades();let unknown=0;
 for(const lead of leads){
  const grade:Grade=['A','B','C'].includes(lead.grade||'')?lead.grade as Grade:'other';grades[grade]++;
  let key='',name='';
  if(kind==='country'){
   const country=reportCountry(String(lead.country||'').normalize('NFKC').replace(/\s*\([A-Za-z]{2}\)\s*$/,''));
   if(country.code){key=country.code;name=countryLabel(country.code);}
  }else{
   const detail=JSON.parse(lead.lead_detail||'{}');
   const value=detail._customer_profile?.city??detail['城市']??detail.city??detail['所在城市']??'';
   const city=typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/g,' '):'';
   if(!missing.has(city.toLowerCase())){name=city.replace(/^([\u4e00-\u9fff]{2,})市$/,'$1');key=name.toLowerCase();}
  }
  if(!key){unknown++;continue;}
  const region=regions.get(key)||{key,name,total:0,grades:emptyGrades()};region.total++;region.grades[grade]++;regions.set(key,region);
 }
 const ranked=[...regions.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'zh-CN'));
 return {kind,total:leads.length,grades,top:ranked.slice(0,10),other:ranked.slice(10).reduce((n,r)=>n+r.total,0),unknown};
}
