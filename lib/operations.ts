export const OP_PLATFORMS = {'抖音':'CNY','小红书':'CNY','视频号':'CNY','阿里':'CNY','Instagram':'USD','Facebook':'USD','YouTube':'USD','TikTok':'USD','谷歌':'USD'} as const;
export type OpPlatform=keyof typeof OP_PLATFORMS;
export const AD_ACCOUNT_PLATFORMS:Record<string,string[]>={'阿里':['阿里'],'抖音本地推':['抖音'],'Meta':['Instagram','Facebook'],'谷歌':['谷歌','YouTube']};
export const opToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
export const opMoney=(n:number)=>new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
export function summarizeOperations(accounts:any[],daily:any[],month:string,today=opToday()){
 return accounts.map(a=>{
  const all=daily.filter(r=>r.account_id===a.id&&r.status==='有效'),rows=all.filter(r=>r.date.startsWith(month)),latest=all.filter(r=>r.date<=month+'-31').sort((a,b)=>b.date.localeCompare(a.date))[0];
  const sum=(key:string)=>rows.reduce((n,r)=>n+r[key],0),ad=sum('ad_spend'),other=sum('other_spend'),revenue=sum('revenue');
  return {...a,followers:latest?.followers_total??null,followers_date:latest?.date||'',gained:sum('followers_change'),today_gained:all.find(r=>r.date===today)?.followers_change??null,posts:sum('posts'),ad_spend:ad,other_spend:other,spent:ad+other,revenue,roi:ad+other>0?revenue/(ad+other):null,days:rows.length,year_ad:all.filter(r=>r.date.startsWith(month.slice(0,4))).reduce((n,r)=>n+r.ad_spend,0)};
 });
}
