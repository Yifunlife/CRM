export type ReportPeriodKind='month'|'quarter'|'year';
export function reportPeriod(params:URLSearchParams,defaultMonth:string){
 const kind=params.get('period')||'month';
 if(!['month','quarter','year'].includes(kind))throw new Error('统计周期无效');
 const month=params.get('month')||defaultMonth;
 const year=params.get('year')||month.slice(0,4);
 if(!/^\d{4}$/.test(year)||Number(year)<2000||Number(year)>9998)throw new Error('年份无效');
 const quarter=params.get('quarter')||String(Math.ceil(Number(month.slice(5,7))/3));
 let start:string,end:string,label:string;
 if(kind==='month'){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000||Number(month.slice(0,4))>9998)throw new Error('月份无效');
  const y=Number(month.slice(0,4)),m=Number(month.slice(5,7));start=month+'-01';end=m===12?`${y+1}-01-01`:`${y}-${String(m+1).padStart(2,'0')}-01`;label=month;
 }else if(kind==='quarter'){
  if(!/^[1-4]$/.test(quarter))throw new Error('季度无效');
  const m=(Number(quarter)-1)*3+1;start=`${year}-${String(m).padStart(2,'0')}-01`;end=m===10?`${Number(year)+1}-01-01`:`${year}-${String(m+3).padStart(2,'0')}-01`;label=`${year}年第${quarter}季度`;
 }else{start=year+'-01-01';end=`${Number(year)+1}-01-01`;label=year+'年';}
 return {kind:kind as ReportPeriodKind,start,end,label};
}
export const inReportPeriod=(date:string|undefined,period:{start:string;end:string})=>!!date&&date>=period.start&&date<period.end;
