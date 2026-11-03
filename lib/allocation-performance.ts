import {nextMonth} from './allocation';
export const RETENTION=[1,.8,.5,.2,0];
export type Adjustment={mode:'manual'|'auto';assessment:'pending'|'qualified'|'unqualified';tier:'0'|'20'|'50'|'80'|'pause'|'review';reason:string;version:number};
export function performanceTier(start:string|undefined,month:string,cash:{month:string;cny:number;usd:number;records:number}[],overrides:Record<string,Adjustment>){
 let level=0;const previousMonth=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-2,1)).toISOString().slice(0,7),latest=cash.find(r=>r.month===previousMonth);let assessment:boolean|null=latest?.records?latest.cny>=5_000_000||latest.usd>=1_000_000:null;
 if(start&&start<=month){for(let current=nextMonth(start);current<=month;current=nextMonth(current)){
  const previous=new Date(Date.UTC(Number(current.slice(0,4)),Number(current.slice(5,7))-2,1)).toISOString().slice(0,7),receipt=cash.find(r=>r.month===previous),manual=overrides[current];
  assessment=manual?.mode==='manual'&&manual.assessment!=='pending'?manual.assessment==='qualified':receipt?.records?receipt.cny>=5_000_000||receipt.usd>=1_000_000:null;
  if(assessment!==null)level=Math.max(0,Math.min(4,level+(assessment?-1:1)));
  if(manual?.mode==='manual'&&['0','20','50','80'].includes(manual.tier))level=['0','20','50','80'].indexOf(manual.tier);
 }}
 const manual=overrides[month];
 if(manual?.mode==='manual')return {level,assessment:manual.assessment==='pending'?null:manual.assessment==='qualified',retention:manual.tier==='pause'||manual.tier==='review'?0:1-Number(manual.tier)/100,tier:manual.tier,manual:true};
 return {level,assessment,retention:start?RETENTION[level]:1,tier:level===4?'review':String([0,20,50,80][level]),manual:false};
}
// Reduced shares go to other normal recipients; without one, the remainder stays pending.
export function adjustedShares(rows:{user_id:string;retention:number}[]){
 if(!rows.length)return [];const base=100/rows.length,normal=rows.filter(r=>r.retention===1).length,surplus=rows.reduce((n,r)=>n+base*(1-r.retention),0);
 return rows.map(r=>({...r,share:base*r.retention+(r.retention===1&&normal?surplus/normal:0)})).filter(r=>r.share>0);
}
