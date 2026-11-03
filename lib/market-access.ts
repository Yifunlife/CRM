import {isColleague} from './contact-kind';
import {boardMarkets,canViewAllMarkets} from './crm';
import {accountSalesCompany} from './account-classification';
import {customerMarket} from './operations-dashboard';
export function boardLeadVisible(user:any,lead:any){
 if(isColleague(lead.grade))return false;
 if(canViewAllMarkets(user))return true;
 const detail=typeof lead.detail==='string'?JSON.parse(lead.detail||'{}'):lead.detail||{};
 const market=accountSalesCompany({id:lead.owner_id||''})||detail._sales_company||lead.sales_company?'外贸':customerMarket(lead);
 return boardMarkets(user).includes(market);
}
export async function boardLeadIds(db:D1Database,user:any){
 const rows=(await db.prepare("SELECT id,owner_id,grade,country,source,business_scope,json_extract(detail,'$._sales_company') AS sales_company FROM crm_leads").all<any>()).results;
 return new Set(rows.filter(l=>boardLeadVisible(user,l)).map(l=>l.id));
}
