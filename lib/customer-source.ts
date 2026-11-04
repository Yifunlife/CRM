// Display the recorded platform without changing the allocation source group.
export const PLATFORM_PENDING='平台待确认';
export const CUSTOMER_SOURCE_OPTIONS=['Facebook','Instagram','Google 广告','抖音','独立站','WhatsApp','阿里','小红书','微信','他人介绍'];
const whatsapp=['whatsapp','whatsapp／其他','whatsapp/其他','whatsapp 自动同步'];
const facebook=['fb','facebook'],instagram=['ig','instagram'];
export function customerSource(lead:any):string{
 const source=String(lead?.source||'').trim(),group=source.toLowerCase();
 let detail=lead?.detail||{};if(typeof detail==='string'){try{detail=JSON.parse(detail);}catch{detail={};}}
 if(CUSTOMER_SOURCE_OPTIONS.includes(detail._source_override))return detail._source_override;
 if(whatsapp.includes(group))return 'WhatsApp';
 if(!['meta',...facebook,...instagram].includes(group))return source||'来源待确认';
 const evidence=[source,lead?.channel,lead?.origin_platform,detail.platform,detail['来源渠道'],detail['来源平台']].map(v=>String(v||'').trim().toLowerCase());
 const fb=evidence.some(v=>facebook.includes(v)),ig=evidence.some(v=>instagram.includes(v));
 return fb&&!ig?'Facebook':ig&&!fb?'Instagram':PLATFORM_PENDING;
}
export function customerSourceSQL(){
 const evidence=['source','channel',"json_extract(detail,'$.platform')","json_extract(detail,'$.来源渠道')","json_extract(detail,'$.来源平台')"];
 const match=(names:string[])=>'('+evidence.map(e=>`lower(trim(COALESCE(${e},''))) IN (${names.map(n=>"'"+n+"'").join(',')})`).join(' OR ')+')';
 const fb=match(facebook),ig=match(instagram);
 return `CASE WHEN json_extract(detail,'$._source_override') IN (${CUSTOMER_SOURCE_OPTIONS.map(s=>"'"+s+"'").join(',')}) THEN json_extract(detail,'$._source_override') WHEN lower(trim(source)) IN (${whatsapp.map(s=>"'"+s+"'").join(',')}) THEN 'WhatsApp' WHEN lower(trim(source)) NOT IN ('meta','fb','facebook','ig','instagram') THEN source WHEN ${fb} AND NOT ${ig} THEN 'Facebook' WHEN ${ig} AND NOT ${fb} THEN 'Instagram' ELSE '${PLATFORM_PENDING}' END`;
}
