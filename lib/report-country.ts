// Normalize only for reporting; preserve the customer's original country field.
const codes='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK'.split(' ');
const key=(value:string)=>value.normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const aliases=new Map<string,string>();
const chinese=new Intl.DisplayNames(['zh-CN'],{type:'region'});
for(const code of codes){aliases.set(key(code),code);for(const locale of ['zh-CN','zh-TW','en','es','fr','ru','ar']){const name=new Intl.DisplayNames([locale],{type:'region'}).of(code);if(name)aliases.set(key(name),code);}}
for(const [code,names] of Object.entries({US:['USA','United States of America','Соединенные Штаты Америки','美国','美國'],CN:['CHN','中国大陆','中国内地','中华人民共和国','mainland china'],AU:['澳洲','澳大利亚'],AE:['阿联酋'],GB:['UK','英国'],BD:['孟加拉'],DO:['多米尼加']}))for(const name of names)aliases.set(key(name),code);
export function reportCountry(value:unknown):{code:string|null;name:string}{
 const raw=String(value||'').trim();if(!raw)return {code:null,name:'国家未登记'};
 let code=aliases.get(key(raw));
 // Some historical forms stored a truncated country object. Its explicit code is usable.
 if(!code&&raw.startsWith('{')){const embedded=/"code"\s*:\s*"([A-Za-z]{2})"/.exec(raw)?.[1]?.toUpperCase();if(embedded&&codes.includes(embedded))code=embedded;}
 if(!code&&raw.includes('('))code=aliases.get(key(raw.split('(')[0]));
 return code?{code,name:code==='AU'?'澳洲':chinese.of(code)||code}:{code:null,name:'国家待核查'};
}
