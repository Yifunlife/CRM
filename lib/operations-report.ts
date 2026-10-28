// Cohorts use the first recorded acquisition of a confirmed customer identity.
// Unlinked consultations stay separate; matching contact text is not identity proof.
export const REPORT_TIMEZONE='Asia/Shanghai';
export const reportDay=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Date(value).toLocaleDateString('sv-SE',{timeZone:REPORT_TIMEZONE});
export function operationsReport({leads,campaigns,attrs,quality,subjects,deals,summary,from,to,asOf,spendRecorded}:{leads:any[];campaigns:any[];attrs:any[];quality:any[];subjects:any[];deals:any[];summary:any[];from:string;to:string;asOf:string;spendRecorded:string[]}){
 const inRange=(d:string)=>(!from||d>=from)&&(!to||d<=to)&&d<=asOf;
 const links=new Map(subjects.map(s=>[s.lead_id,s.subject_id])),attribution=new Map(attrs.map(a=>[a.lead_id,a])),qualities=new Map(quality.map(q=>[q.lead_id,q]));
 const byId=new Map(campaigns.map(c=>[c.id,c])),groups=new Map<string,any[]>(),buckets=new Map<string,any>();
 const acquired=(l:any)=>l.entered&&/^\d{4}-\d{2}-\d{2}$/.test(l.entered)?l.entered:reportDay(l.created);
 function origin(l:any){const a=attribution.get(l.id);return a?.source_kind==='广告活动'&&byId.has(a.campaign_id)?a.campaign_id:a?.source_kind&&a.source_kind!=='广告活动'?a.source_kind:'未知来源';}
 function bucket(key:string){if(!buckets.has(key)){const c=byId.get(key),spend=summary.find(s=>s.key===key&&s.currency===c?.currency);buckets.set(key,{key,label:c?.name||key,platform:c?.platform||'',currency:c?.currency||'',spent_minor:spendRecorded.includes(key)?spend?.spent_minor??0:null,consultations:0,customers:0,verified_customers:0,unverified_customers:0,valid:0,invalid:0,unchecked:0,contacted:0,converted:0,conversion:null,cost_per_valid_minor:null,grades:{VIP:0,A:0,B:0,C:0,未评级:0},statuses:{}});}return buckets.get(key);}
 for(const c of campaigns)bucket(c.id);
 for(const l of leads){const key=links.has(l.id)?'subject:'+links.get(l.id):'lead:'+l.id;if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(l);if(inRange(acquired(l)))bucket(origin(l)).consultations++;}
 const customers=[];
 for(const [key,members] of groups){
  members.sort((a,b)=>acquired(a).localeCompare(acquired(b))||a.created.localeCompare(b.created)||a.id.localeCompare(b.id));
  const first=members[0],date=acquired(first);if(!inRange(date))continue;
  const source=origin(first),b=bucket(source),memberIds=new Set(members.map(l=>l.id)),validDeals=deals.filter(d=>memberIds.has(d.lead_id)&&!d.cancelled&&d.deal_date>=date&&d.deal_date<=asOf);
  const state=qualities.get(first.id)?.state||'待核查',verified=links.has(first.id),contacted=members.some(l=>!!l.last_contact),converted=state==='有效'&&validDeals.length>0;
  b.customers++;b[verified?'verified_customers':'unverified_customers']++;b[state==='有效'?'valid':state==='无效'?'invalid':'unchecked']++;if(contacted)b.contacted++;if(converted)b.converted++;
  b.grades[first.grade||'未评级']=(b.grades[first.grade||'未评级']||0)+1;b.statuses[first.status]=(b.statuses[first.status]||0)+1;
  customers.push({key,lead_id:first.id,name:first.name,owner_name:first.owner_name||first.original_owner||'待分配',acquired:date,source_key:source,grade:first.grade||'未评级',status:first.status,quality:state,verified,contacted,converted,deals:validDeals.length});
 }
 return {from,to,as_of:asOf,timezone:REPORT_TIMEZONE,rows:[...buckets.values()].map(b=>({...b,conversion:b.valid?b.converted/b.valid:null,cost_per_valid_minor:b.valid&&b.spent_minor!==null?b.spent_minor/b.valid:null})),customers};
}
