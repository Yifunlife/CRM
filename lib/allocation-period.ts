import {monthNow} from './allocation';

export function performanceDates(period:'month'|'quarter'|'year',at=new Date()){
 const [year,month]=monthNow(at).split('-').map(Number);
 const first=period==='year'?1:period==='quarter'?Math.floor((month-1)/3)*3+1:month;
 const last=period==='year'?12:period==='quarter'?first+2:month;
 return {from:`${year}-${String(first).padStart(2,'0')}-01`,to:new Date(Date.UTC(year,last,0)).toISOString().slice(0,10)};
}

export function performanceRange(from:string,to:string){
 const valid=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
 if(!valid(from)||!valid(to))throw new Error('请选择有效的开始和结束日期');
 if(from>to)throw new Error('结束日期不能早于开始日期');
 // Resolve each Sydney midnight separately because the range can cross daylight saving.
 const boundary=(wall:number)=>{let instant=wall;for(let i=0;i<3;i++){
  const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(instant));
  instant+=wall-Date.parse(local.replace(' ','T')+'Z');
 }return new Date(instant).toISOString();};
 const endOfMonth=new Date(Date.UTC(Number(from.slice(0,4)),Number(from.slice(5,7)),0)).toISOString().slice(0,10);
 return {from,to,startAt:boundary(Date.parse(from+'T00:00:00Z')),endAt:boundary(Date.parse(to+'T00:00:00Z')+86400000),month:from.endsWith('-01')&&to===endOfMonth?from.slice(0,7):null};
}
