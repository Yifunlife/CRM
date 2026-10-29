export type MetaAdMetric={account_id:string;date:string;spent:number;impressions:number;clicks:number;results:number;result_type:string;campaign_id?:string;campaign_name?:string};
export type MetaPeriod='month'|'quarter'|'year';
export function metaPeriod(date:string,period:MetaPeriod){return period==='year'?date.slice(0,4):period==='quarter'?`${date.slice(0,4)}-Q${Math.ceil(Number(date.slice(5,7))/3)}`:date.slice(0,7);}
export function metaTotals(rows:MetaAdMetric[]){
 const total={spent:0,impressions:0,clicks:0,results:{} as Record<string,number>};
 for(const row of rows){total.spent+=row.spent;total.impressions+=row.impressions;total.clicks+=row.clicks;if(row.result_type&&!['reach','frequency'].includes(row.result_type))total.results[row.result_type]=(total.results[row.result_type]||0)+row.results;}
 return total;
}
export function metaPeriodRows(rows:MetaAdMetric[],period:MetaPeriod,account='',year=''){
 const groups=new Map<string,MetaAdMetric[]>();
 for(const row of rows){if(account&&row.account_id!==account||year&&!row.date.startsWith(year))continue;const key=metaPeriod(row.date,period);groups.set(key,[...(groups.get(key)||[]),row]);}
 return [...groups].sort(([a],[b])=>b.localeCompare(a)).map(([period,rows])=>({period,...metaTotals(rows)}));
}
export const metaResultLabel=(type:string)=>({'actions:like':'主页点赞','total_profile_visits':'主页访问','page_visit_view':'Facebook 主页访问','profile_visit_view':'Instagram 主页访问','actions:leadgen.other':'表单线索','actions:onsite_conversion.lead_grouped':'线索','actions:onsite_conversion.messaging_conversation_started_7d':'消息对话','actions:link_click':'链接点击','actions:post_engagement':'帖文互动','actions:video_view':'视频观看','actions:landing_page_view':'落地页浏览','reach':'触达人数','impressions':'展示次数'}[type]||type);
