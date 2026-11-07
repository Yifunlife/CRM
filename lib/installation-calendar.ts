import type {InstallationPlan} from './project-installation';
export type InstallationCalendarEvent={id:string;projectId:string;name:string;start:string;end:string;label:string;tone:'arrival'|'actual'|'planned'|'confirmed';people:string;owner:string;range?:boolean};
export const calendarDate=(value:unknown):string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:'';
export function calendarToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function calendarMonthDays(month:string){
 const first=new Date(month+'-01T00:00:00Z'),offset=(first.getUTCDay()+6)%7,last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 return Array.from({length:Math.ceil((offset+last)/7)*7},(_,i)=>new Date(first.getTime()+(i-offset)*86400000).toISOString().slice(0,10));
}
export function calendarRangeDays(month:string,from:string,to:string){
 const days=calendarMonthDays(month),own=days.filter(date=>date.startsWith(month)),start=from>own[0]?from:own[0],end=to<own[own.length-1]?to:own[own.length-1];
 return start>end?[]:days.filter((_,i)=>days[Math.floor(i/7)*7]<=end&&days[Math.floor(i/7)*7+6]>=start);
}
export function shiftCalendarMonth(month:string,by:number){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+by);return d.toISOString().slice(0,7);}
export function calendarProjectColor(projectId:string){
 const suffix=projectId.match(/-(\d+)$/);let hash=2166136261;
 for(const char of suffix?projectId.slice(0,-suffix[0].length):projectId)hash=Math.imul(hash^char.charCodeAt(0),16777619);
 const hue=((hash>>>0)%360+(suffix?Number(suffix[1])*137.508:0))%360;
 return {backgroundColor:`hsl(${hue.toFixed(2)} 65% 91%)`,color:`hsl(${hue.toFixed(2)} 65% 24%)`};
}
export function calendarProjectNumbers(rows:any[]){
 const numbers:Record<string,number>={},used=new Set<number>(),ordered=[...rows].sort((a,b)=>a.id.localeCompare(b.id));
 for(const row of ordered){const n=Number(row.original?.details?.installation_source?.row);if(Number.isInteger(n)&&n>0&&!used.has(n)){numbers[row.id]=n;used.add(n);}}
 let next=1;for(const row of ordered)if(!numbers[row.id]){while(used.has(next))next++;numbers[row.id]=next;used.add(next++);}
 return numbers;
}
// Month/day notes use the documented source year, never the displayed calendar year.
function noteDates(note:string,year:string){
 const result:{date:string;label:string}[]=[];let previous=0;
 for(const match of note.matchAll(/(?:(\d{4})[年/-])?(\d{1,2})[月/-](\d{1,2})(?:[日号])?/g)){
  const date=calendarDate(`${match[1]||year}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`),label=note.slice(previous,match.index).replace(/^[\s；;，,]+|[\s；;，,]+$/g,'');
  previous=match.index!+match[0].length;if(date)result.push({date,label});
 }
 return result;
}
export function installationCalendarEvents(row:any,plan:InstallationPlan){
 const result:InstallationCalendarEvent[]=[],source=row.original?.details?.installation_source,sourceYear=String(source?.title||'').match(/\d{4}/)?.[0]||'';
 const add=(start:unknown,label:string,tone:InstallationCalendarEvent['tone'],end?:string,range=false)=>{const date=calendarDate(start);if(date)result.push({id:row.id+':'+result.length,projectId:row.id,name:row.name,start:date,end:end||date,label,tone,range,people:plan.factory.people||'',owner:plan.factory.project_lead||''});};
 const arrivals=(date:unknown,note:string,label:string,tone:InstallationCalendarEvent['tone'])=>{const parsed=noteDates(note,calendarDate(date).slice(0,4)||sourceYear);for(const item of parsed)add(item.date,[label,item.label].filter(Boolean).join(' · '),tone);if(!parsed.some(item=>item.date===date))add(date,label,tone);};
 arrivals(plan.profile.planned_arrival||row.deliveryDate,plan.profile.planned_arrival_note||'','计划到货','arrival');
 arrivals(plan.client.actual_arrival,String(plan.client.actual_arrival_note||''),'实际到货','actual');
 const departure=calendarDate(plan.travel.departure_date)||calendarDate(plan.factory.departure_date),end=calendarDate(plan.factory.end_date),confirmed=plan.travel.issued&&!plan.travel.reconfirmation;
 if(departure&&end&&end>=departure)add(departure,confirmed?'已定行程':'行程计划',confirmed?'confirmed':'planned',end,true);
 else{add(departure,confirmed?'行程出发':'计划出发',confirmed?'confirmed':'planned');add(end,'计划结束','planned');}
 add(plan.travel.actual_departure,'实际出发','actual');add(plan.acceptance.actual_end,'实际结束','actual');
 return result;
}
