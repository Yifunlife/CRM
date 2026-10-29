import {reportCountry} from './report-country';
import {continentByCode} from './country-geography';
export const continents=['亚洲','欧洲','非洲','美洲','大洋洲'];
export function countryDistribution(rows:{country:string;customers:number}[]){
 const countries=new Map<string,number>(),counts:Record<string,number>=Object.fromEntries(continents.map(c=>[c,0]));let unknown=0,total=0;
 for(const row of rows){const n=row.customers;if(!Number.isFinite(n)||n<0)continue;total+=n;const c=reportCountry(row.country),continent=c.code&&continentByCode[c.code];if(continent)counts[continent]+=n;else unknown+=n;if(c.code)countries.set(c.name,(countries.get(c.name)||0)+n);}
 const ranked=[...countries].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-CN'));
 return {total,unknown,counts,top:ranked.slice(0,10),other:ranked.slice(10).reduce((s,r)=>s+r[1],0)};
}
