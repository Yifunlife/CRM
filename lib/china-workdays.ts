// 国办发明电〔2025〕7号：https://www.gov.cn/zhengce/content/202511/content_7047090.htm
const holidays=[['2026-01-01','2026-01-03'],['2026-02-15','2026-02-23'],['2026-04-04','2026-04-06'],['2026-05-01','2026-05-05'],['2026-06-19','2026-06-21'],['2026-09-25','2026-09-27'],['2026-10-01','2026-10-07']];
const workingWeekends=new Set(['2026-01-04','2026-02-14','2026-02-28','2026-05-09','2026-09-20','2026-10-10']);
export const chinaToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
export function nextChinaWorkday(assigned:string):string|null{
 if(!assigned||!Number.isFinite(Date.parse(assigned)))return null;
 let day=new Date(assigned).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 for(let i=0;i<20;i++){
  day=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  if(!day.startsWith('2026-'))return null;
  if(workingWeekends.has(day))return day;
  const weekday=new Date(day+'T00:00:00Z').getUTCDay();
  if(weekday!==0&&weekday!==6&&!holidays.some(([from,to])=>day>=from&&day<=to))return day;
 }
 return null;
}
