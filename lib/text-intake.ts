import {ALLOCATION_IMPORT_FIELDS} from './allocation-import-fields';
import {continentByCode} from './country-geography';
import {reportCountry} from './report-country';
export type IntakeRow=Record<string,string>;
const normalized=(value:string)=>value.trim().toLowerCase().replace(/[\s_]/g,'');
const labels=new Map(Object.entries(ALLOCATION_IMPORT_FIELDS).flatMap(([key,aliases])=>[key,...aliases].map(alias=>[normalized(alias),key] as const)));
for(const [alias,key] of [['留言','项目需求描述'],['客户姓名','客户名称'],['产品','推广产品'],['客户类型','客户身份'],['偏好联系方式','联系方式偏好']])labels.set(normalized(alias),key);
const heading=/^\s*(?:(?:WhatsApp|微信|抖音|小红书)\s*)?(?:新增客资|新增客户|客户资料|客资资料)\s*[:：]?\s*$/i;
const countries=Object.fromEntries(Object.keys(continentByCode).map(code=>[code,[new Intl.DisplayNames(['en'],{type:'region'}).of(code)!,new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(code)!]]));
function parseBlock(raw:string):IntakeRow{
 const row:IntakeRow={'原始内容':raw};
 for(const line of raw.split('\n')){const field=/^\s*([^:：]{1,32})\s*[:：]\s*(.*)$/.exec(line);if(field){const key=labels.get(normalized(field[1]));if(key&&field[2].trim())row[key]=field[2].trim();}}
 const withoutUrls=raw.replace(/https?:\/\/[^\s<>]+/gi,''),phones=[...withoutUrls.matchAll(/(?:\+|00)\d[\d ().-]{5,24}\d|(?<!\d)1[3-9]\d{9}(?!\d)/g)].map(m=>m[0].trim()).filter(p=>{const n=p.replace(/\D/g,'').replace(/^00/,'');return n.length>=7&&n.length<=15;});
 if(!row['联系方式']&&phones.length)row['联系方式']=phones[0].replace(/^00/,'+');
 if(!row['邮箱'])row['邮箱']=raw.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]||'';
 if(!row['客户名称'])row['客户名称']=raw.match(/\b(?:my name is|I am|I'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?=[,.!\n]|$)/)?.[1]||'';
 if(!row['所在国家/地区']){const matches=Object.entries(countries).filter(([,names])=>names.some(name=>/^[\x00-\x7F]+$/.test(name)?new RegExp('\\b'+name+'\\b','i').test(raw):raw.includes(name)));if(matches.length===1)row['所在国家/地区']=reportCountry(matches[0][0]).name;else if(matches.length>1)row['识别提示']='提到多个国家，请核对客户所在国家。';}
 const account=raw.match(/乐园号|玩具号|工厂号/)?.[0];if(account&&!row['来源账号'])row['来源账号']=account;
 if(!row['推广产品'])row['推广产品']=raw.match(/[（(](?:乐园号|玩具号|工厂号)?\s*([^()（）\n]*(?:桌|设备|玩具|乐园|滑梯|挖掘机)[^()（）\n]*)[）)]/)?.[1]?.trim()||'';
 if(!row['客户身份']&&/\b(?:we are|we're)\s+(?:a|an)\s+school\b|学校|幼儿园/i.test(raw))row['客户身份']='学校';
 if(!row['来源平台'])row['来源平台']=/whatsapp/i.test(raw)?'WhatsApp':/小红书/.test(raw)?'小红书':/抖音/.test(raw)?'抖音':'';
 if(!row['联系方式偏好']&&/whatsapp/i.test(raw))row['联系方式偏好']='WhatsApp';
 row['项目需求描述']=raw.split('\n').filter(line=>!heading.test(line)&&!/^\s*(未分配|待分配)[。.]?\s*$/.test(line)&&!phones.includes(line.trim())).join('\n').replace(/^留言\s*[:：]\s*/,'').trim();
 const links=raw.match(/https?:\/\/[^\s<>（）)]+/gi);if(links?.length)row['相关链接']=[...new Set(links)].join('\n');
 // Unassigned labels are a state, never an employee name.
 if(/^(未分配|待分配|暂无|无|—|-)[。.]?$/.test(row['分配业务员']||''))row['分配业务员']='';
 if(phones.length>1)row['识别提示']=[row['识别提示'],'发现多个电话号码，请确认是否属于同一客户；不同客户请用“新增客资”或 --- 分隔。'].filter(Boolean).join(' ');
 if(!row['客户名称'])row['识别提示']=[row['识别提示'],'姓名待补充，确认时按“暂无”入档。'].filter(Boolean).join(' ');
 return row;
}
export function parseIntakeText(text:string):IntakeRow[]{
 if(!text.trim())throw new Error('请先粘贴客资文字');
 if(text.length>100000)throw new Error('文字超过10万字，请分批解析');
 const blocks:string[]=[];let lines:string[]=[];
 const flush=()=>{if(lines.some(line=>line.trim()))blocks.push(lines.join('\n').trim());lines=[];};
 for(const line of text.replace(/\r\n?/g,'\n').split('\n')){if(/^\s*[-=]{3,}\s*$/.test(line)){flush();continue;}if(heading.test(line)&&lines.some(v=>v.trim()))flush();lines.push(line);}flush();
 if(blocks.length>300)throw new Error('单次文字解析最多300条，请分批处理');
 return blocks.map(parseBlock);
}
