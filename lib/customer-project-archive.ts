import {projectOverviewFacts} from './project-overview';
import {PROJECT_STAGES} from './sales-suite';
import {deliveryStage} from './role-workspace';

// A linked sales project and its order are one project in the customer archive.
export function customerProjectArchive(projects:any[],orders:any[]){
 const stages=Object.fromEntries(PROJECT_STAGES),deals=new Set(orders.map(o=>o.deal_id).filter(Boolean));
 return [
  ...orders.map(o=>({id:'order:'+o.id,name:o.project,stage:deliveryStage(o),...projectOverviewFacts(o,projects.find(p=>o.deal_id&&p.details.deal_id===o.deal_id))})),
  ...projects.filter(p=>!p.details.deal_id||!deals.has(p.details.deal_id)).map(p=>({id:'sales:'+p.project_id,name:p.name,stage:stages[p.stage]||p.stage,...projectOverviewFacts(p)}))
 ];
}
