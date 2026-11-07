import {calendarDate} from './installation-calendar';
import {installationStatus,type InstallationPlan} from './project-installation';
const millis=(value:string)=>Date.parse(value+'T00:00:00Z');
export const installationDayDifference=(from:string,to:string)=>Math.round((millis(to)-millis(from))/86400000);
export const installationAddDays=(date:string,days:number)=>new Date(millis(date)+days*86400000).toISOString().slice(0,10);
export function installationSchedule(plan:InstallationPlan){
 const start=calendarDate(plan.factory.departure_date)||calendarDate(plan.travel.departure_date),end=calendarDate(plan.factory.end_date),actualEnd=calendarDate(plan.acceptance.actual_end),days=plan.factory.days|| (start&&end&&end>=start?String(installationDayDifference(start,end)+1):'');
 return {start,end,actualEnd,days,technicians:plan.factory.technicians||'',transfer:Number(plan.factory.transfer_days||'1')};
}
export function installationInMonth(plan:InstallationPlan,month:string){
 const {start,end}=installationSchedule(plan),first=month+'-01',last=installationAddDays(month+'-01',new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()-1);
 if(!start&&!end)return true;
 return (!start||start<=last)&&(!end||end>=first);
}
export function installationRemaining(plan:InstallationPlan,today:string){
 const {end}=installationSchedule(plan);
 if(plan.acceptance.installed||plan.acceptance.accepted)return '已完成安装';
 if(!end)return '工期待确认';
 const days=installationDayDifference(today,end);
 return days<0?'超计划 '+Math.abs(days)+' 天':'计划剩余 '+days+' 天';
}
export function installationProgress(plan:InstallationPlan){return plan.acceptance.installed||plan.acceptance.accepted?installationStatus(plan):calendarDate(plan.travel.actual_departure)?'安装中':installationStatus(plan);}
export const installationTechnicians=(names:string)=>names.split(/[、，,;；+\n]/).map(v=>v.trim()).filter(Boolean);
export function installationCrewSchedule(name:string,plans:InstallationPlan[],today:string){
 const jobs=plans.filter(p=>installationTechnicians(p.factory.technicians||'').includes(name)&&!p.acceptance.installed&&!p.acceptance.accepted),schedules=jobs.map(installationSchedule),incomplete=schedules.some(s=>!s.start||!s.end);
 let conflict=false,available=today;
 for(let i=0;i<schedules.length;i++){
  const a=schedules[i];if(a.end){const next=installationAddDays(a.end,1+a.transfer);if(next>available)available=next;}
  for(let j=i+1;j<schedules.length;j++){const b=schedules[j];if(a.start&&a.end&&b.start&&b.end&&a.start<=installationAddDays(b.end,b.transfer)&&b.start<=installationAddDays(a.end,a.transfer))conflict=true;}
 }
 return {jobs,incomplete,conflict,available:incomplete||conflict?'':available};
}

export function installationStaffCounts(plan:InstallationPlan){
 const number=(v:unknown)=>typeof v==='string'&&/^\d+$/.test(v)?Number(v):null;
 const external=number(plan.factory.external_people)??(plan.factory.external_technicians?null:0),total=number(plan.factory.people),company=number(plan.factory.company_people)??(external!==null&&total!==null&&total>=external?total-external:null);
 return {company,external};
}
export function installationStaffLabel(plan:InstallationPlan){const c=installationStaffCounts(plan),label=(name:string,value:number|null)=>name+(value===null?'待定':value+'位');return label('师傅',c.company)+'+'+label('外请',c.external);}
