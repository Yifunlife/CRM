export const OP_PLATFORMS = {'抖音':'CNY','小红书':'CNY','视频号':'CNY','阿里':'CNY','Instagram':'USD','Facebook':'USD','YouTube':'USD','TikTok':'USD','谷歌':'USD'} as const;
export type OpPlatform=keyof typeof OP_PLATFORMS;
export const AD_ACCOUNT_PLATFORMS:Record<string,string[]>={'阿里':['阿里'],'抖音本地推':['抖音'],'Meta':['Instagram','Facebook'],'谷歌':['谷歌','YouTube']};
export const opToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
export const opMoney=(n:number)=>new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
// Derive from totals at read time so backfills, corrections and voids also update later days.
export function deriveFollowerChanges(daily:any[]){
 const previous=new Map<string,any>(),derived=new Map<string,any>();
 for(const r of [...daily].sort((a,b)=>a.date.localeCompare(b.date))){
  if(r.status!=='有效'||r.followers_total===null){derived.set(r.id,{...r,followers_change:null,interval_change:null,previous_date:null,gap_days:null});continue;}
  const prev=previous.get(r.account_id),gap=prev?(Date.parse(r.date)-Date.parse(prev.date))/86400000:null,diff=prev?r.followers_total-prev.followers_total:null;
  derived.set(r.id,{...r,followers_change:gap===1?diff:null,interval_change:diff,previous_date:prev?.date??null,gap_days:gap});previous.set(r.account_id,r);
 }
 return daily.map(r=>derived.get(r.id));
}
export function followerChangeText(r:any){
 if(!r||r.status==='作废')return '—';
 if(r.followers_change!==null&&r.followers_change!==undefined)return `${r.followers_change>0?'+':''}${r.followers_change}（当天净增）`;
 if(r.interval_change!==null&&r.interval_change!==undefined)return `${r.interval_change>0?'+':''}${r.interval_change}（距 ${r.previous_date}，间隔 ${r.gap_days} 天）`;
 return '待计算（暂无更早记录）';
}
export function advertisingSpend(ads:any[],accountId:string,date:string){
 const rows=ads.filter(r=>r.spend_basis==='daily'&&r.account_id===accountId&&r.date===date&&r.status!=='作废');
 return {amount:rows.reduce((n,r)=>n+r.spent,0),count:rows.length};
}
export function summarizeOperations(accounts:any[],daily:any[],month:string,today=opToday()){
 const computed=deriveFollowerChanges(daily),start=month+'-01',baselineDate=new Date(Date.parse(start)-86400000).toISOString().slice(0,10);
 return accounts.map(a=>{
  const all=computed.filter(r=>r.account_id===a.id&&r.status==='有效'),rows=all.filter(r=>r.date.startsWith(month)),latest=all.filter(r=>r.date<=month+'-31').sort((a,b)=>b.date.localeCompare(a.date))[0],baseline=all.find(r=>r.date===baselineDate);
  const sum=(key:string)=>rows.reduce((n,r)=>n+r[key],0),ad=sum('ad_spend'),other=sum('other_spend'),revenue=sum('revenue');
  return {...a,followers:latest?.followers_total??null,followers_date:latest?.date||'',gained:baseline&&latest?.date.startsWith(month)?latest.followers_total-baseline.followers_total:null,today_gained:all.find(r=>r.date===today)?.followers_change??null,posts:sum('posts'),ad_spend:ad,other_spend:other,spent:ad+other,revenue,roi:ad+other>0?revenue/(ad+other):null,days:rows.length,year_ad:all.filter(r=>r.date.startsWith(month.slice(0,4))).reduce((n,r)=>n+r.ad_spend,0)};
 });
}
