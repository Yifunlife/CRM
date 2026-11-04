import {can,canSetManagement,clean} from './crm';
import {Problem} from './api/http';
export const ALLOCATION_ACCOUNTS:Record<string,Record<string,string[]>>={
 内贸:{抖音:['工厂号','乐园号','玩具号'],小红书:['工厂号','乐园号','玩具号'],视频号:['视频号']},
 外贸:{Instagram:['乐园号','玩具号','工厂号'],Facebook:['乐园号','玩具号','工厂号'],YouTube:['Yifunlife_play'],TikTok:['乐园号']},
};
export const FOREIGN_INTAKE_CHANNELS=['Google 广告','独立站','WhatsApp','WhatsApp／其他','阿里'];
export function allocationPlatforms(market:string){return Object.keys(ALLOCATION_ACCOUNTS[market]||{});}
export function allocationImportSource(platform:string){return ['Instagram','Facebook'].includes(platform)?'Meta':platform;}
export function canImportDomestic(user:any,actor=user){return user?.id===actor?.id&&user?.role==='operations'&&actor?.role==='operations'&&can(user,'customers_edit')&&can(actor,'customers_edit');}
export function domesticAllocationImport(user:any,actor:any,body:any){return canImportDomestic(user,actor)&&body?.allocation_management===true&&body.market==='内贸'&&body.allocate===false;}
export function prepareAllocationImport(user:any,actor:any,body:any){
 if(body.allocation_management!==true||!body.market)return body;
 if(!ALLOCATION_ACCOUNTS[body.market])throw new Problem('请选择内贸或外贸');
 if(!(canSetManagement(user)&&canSetManagement(actor)&&user.id===actor.id)&&!domesticAllocationImport(user,actor,body))throw new Problem('运营仅可导入内贸表单，不能分配客户或导入外贸',403);
 if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>3000)throw new Problem('每次导入1至3000条');
 const platforms=allocationPlatforms(body.market),aliases:Record<string,string>={ig:'Instagram',ins:'Instagram',instagram:'Instagram',fb:'Facebook',facebook:'Facebook',youtube:'YouTube',tiktok:'TikTok'};
 const defaultPlatform=clean(body.platform||body.source,40),defaultAccount=clean(body.account,100);
 const rows=body.rows.map((r:any,i:number)=>{
  const raw=clean(r['来源平台']||r.platform,40)||defaultPlatform,platform=aliases[raw.toLowerCase()]||raw;
  const account=clean(r['来源账号']||r.source_account||r['运营账号'],100)||defaultAccount;
  const supported=platforms.includes(platform)||body.market==='外贸'&&FOREIGN_INTAKE_CHANNELS.includes(platform);
  if(!supported)throw new Problem(`第 ${i+1} 行来源平台不属于${body.market}，请核对原表`);
  if(/super\s*tada|technical\s*support/i.test(account))throw new Problem(`第 ${i+1} 行账号不纳入分配管理，请从表单移除`);
  if(ALLOCATION_ACCOUNTS[body.market][platform]&&!ALLOCATION_ACCOUNTS[body.market][platform].includes(account))throw new Problem(`第 ${i+1} 行请选择${platform}对应的来源账号`);
  return {...r,'来源平台':platform,'来源账号':account,'客资市场':body.market,platform,source_account:account};
 });
 const groups=[...new Set(rows.map((r:any)=>allocationImportSource(r['来源平台'])))];
 if(groups.length!==1)throw new Problem('同一表单的来源渠道不同，请按平台分别导入；Instagram 和 Facebook 可同表导入');
 return {...body,source:groups[0],allocate:false,rows};
}

export function allocationRecipientMarket(user:any,market:string){try{const scopes=typeof user.trade_scopes==='string'?JSON.parse(user.trade_scopes):user.trade_scopes;return Array.isArray(scopes)&&scopes.includes(market==='内贸'?'domestic':market==='外贸'?'foreign':'');}catch{return false;}}

export function customerOwnerEligible(user:any,market?:string){return ['sales','management','ceo'].includes(user.role)||user.role==='followup'&&(market?allocationRecipientMarket(user,market):['内贸','外贸'].some(m=>allocationRecipientMarket(user,m)));}
