export const CUSTOMER_CONTACT_METHODS=['WhatsApp','邮件','微信','电话','线上会议','到访公司','拜访客户','其他'];
const aliases:Record<string,string[]>={
 WhatsApp:['whatsapp','by_whats_app','by_whatsapp','首次whatsapp','二次whatsapp'],
 邮件:['邮件','email','e-mail','by_email','首次邮件','二次邮件'],
 微信:['微信','wechat','weixin','by_wechat'],
 电话:['电话','phone','telephone','by_phone','by_telephone'],
 线上会议:['线上会议'],到访公司:['到访公司'],拜访客户:['拜访客户'],其他:['其他'],
};
const entries=Object.entries(aliases).flatMap(([label,values])=>values.map(value=>[value,label]));
export function contactMethod(value:unknown){const raw=typeof value==='string'?value.trim():'';return entries.find(([alias])=>alias===raw.toLowerCase())?.[1]||raw;}
export const contactMethodAliases=entries.map(([alias])=>alias);
export function contactMethodSQL(value:string){return `CASE lower(trim(COALESCE(${value},''))) ${entries.map(([alias,label])=>`WHEN '${alias}' THEN '${label}'`).join(' ')} ELSE trim(COALESCE(${value},'')) END`;}

