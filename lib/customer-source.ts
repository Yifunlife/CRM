// Display the recorded platform without changing the allocation source group.
export const PLATFORM_PENDING='Meta（平台待确认）';
const facebook=['fb','facebook'],instagram=['ig','instagram'];
export function customerSource(lead:any):string{
 const source=String(lead?.source||'').trim(),group=source.toLowerCase();
 if(!['meta',...facebook,...instagram].includes(group))return source||'来源待确认';
 let detail=lead?.detail||{};if(typeof detail==='string'){try{detail=JSON.parse(detail);}catch{detail={};}}
 const evidence=[source,lead?.channel,detail.platform,detail['来源渠道'],detail['来源平台']].map(v=>String(v||'').trim().toLowerCase());
 const fb=evidence.some(v=>facebook.includes(v)),ig=evidence.some(v=>instagram.includes(v));
 return fb&&!ig?'Facebook':ig&&!fb?'Instagram':PLATFORM_PENDING;
}
export function customerSourceSQL(){
 const evidence=['source','channel',"json_extract(detail,'$.platform')","json_extract(detail,'$.来源渠道')","json_extract(detail,'$.来源平台')"];
 const match=(names:string[])=>'('+evidence.map(e=>`lower(trim(COALESCE(${e},''))) IN (${names.map(n=>"'"+n+"'").join(',')})`).join(' OR ')+')';
 const fb=match(facebook),ig=match(instagram);
 return `CASE WHEN lower(trim(source)) NOT IN ('meta','fb','facebook','ig','instagram') THEN source WHEN ${fb} AND NOT ${ig} THEN 'Facebook' WHEN ${ig} AND NOT ${fb} THEN 'Instagram' ELSE '${PLATFORM_PENDING}' END`;
}
