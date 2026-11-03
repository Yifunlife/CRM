import {roleWorkspaceEndpoint} from './role-workspace-server';
import {boardMarkets} from './crm';
import {reportAcquiredDay} from './report-acquired-day';
import {PROJECT_STAGES} from './sales-suite';
import {DELIVERY_STAGES} from './role-workspace';
const pick=(row:any,keys:string[])=>Object.fromEntries(keys.map(k=>[k,row[k]??null]));
const customerKeys=['id','name','owner_id','grade','created','company','market'];
export async function groupSnapshot(db:D1Database,quotes?:D1Database){
 const users=(await db.prepare("SELECT id,name,email,role,active,permissions,trade_scopes FROM crm_users WHERE active=1 AND role IN ('admin','ceo','management','sales') ORDER BY role,id").all<any>()).results;
 const [leadDates,quoteDates]=await Promise.all([
  db.prepare('SELECT id,entered,created,next_date,status,country FROM crm_leads').all<any>(),
  db.prepare('SELECT id,created FROM crm_sales_quote_links').all<any>()
 ]);
 const leadMeta=new Map(leadDates.results.map((r:any)=>[r.id,r]));
 const acquired=new Map(leadDates.results.map((r:any)=>[r.id,reportAcquiredDay(r.entered)||reportAcquiredDay(r.created)]));
 const created=new Map(quoteDates.results.map((r:any)=>[r.id,r.created]));
 const viewers=[];
 for(const u of users){
  const markets=boardMarkets(u),user=pick(u,['id','name','email','role']);
  if(!markets.length){viewers.push({...user,allowed:false});continue;}
  try{
   const url=new URL('https://crm.internal/api/role-workspace/report');
   url.searchParams.set('period','custom');url.searchParams.set('start','2000-01-01');url.searchParams.set('end','2100-12-31');url.searchParams.set('market',markets.length===2?'全部':markets[0]);
   const raw=await roleWorkspaceEndpoint(db,u,u,'role-workspace/report','GET',{},url,quotes);
   if(!raw||raw instanceof Response)throw Error('Report unavailable');
   const data:any=raw;
   viewers.push({...user,allowed:true,personal:data.personal,markets,
    people:data.people.map((r:any)=>pick(r,['id','name','role','active','company'])),
    customers:data.all_customers.map((r:any)=>({...pick(r,customerKeys),acquired:acquired.get(r.id)||null,country:leadMeta.get(r.id)?.country||'',status:leadMeta.get(r.id)?.status||'',next_date:leadMeta.get(r.id)?.next_date||null})),
    projects:data.projects.map((r:any)=>({...pick(r,['project_id','lead_id','owner_id','name','customer_name','stage','stage_at','expected_date','currency','amount_minor','created','company','market','blocker','next_action']),deal_id:r.details?.deal_id||null})),
    quotes:data.quotes.map((r:any)=>({...pick(r,['id','project_id','owner_id','lead_id']),created:created.get(r.id)||null,summary:pick(r.summary||{},['available','currency','amount_minor'])})),
    deals:data.deals.map((r:any)=>pick(r,['id','lead_id','owner_id','customer_name','order_number','deal_date','currency','total_minor','received_minor','outstanding_minor','receipt_currency_mismatch','company','market'])),
    orders:data.orders.map((r:any)=>({...pick(r,['id','deal_id','lead_id','project','customer_name','commercial_id','commercial_name','logistics_name','delivery_stage','company','market']),planned_ship:r.details?.dates?.planned_ship?.date||null,eta_port:r.details?.dates?.eta_port?.date||null}))
   });
  }catch(e:any){if(e.status===403||e.statusCode===403){viewers.push({...user,allowed:false});continue;}throw e;}
 }
 const tables:Record<string,Map<string,any>>=Object.fromEntries(['customers','projects','quotes','deals','orders'].map(k=>[k,new Map()]));
 for(const person of viewers as any[]){
  if(!person.allowed)continue;
  for(const [key,table] of Object.entries(tables)){
   const field=key==='projects'?'project_id':'id',rows=person[key];
   for(const row of rows)table.set(row[field],row);
   person[key]=rows.map((row:any)=>row[field]);
  }
 }
 const records=Object.fromEntries(Object.entries(tables).map(([key,table])=>[key,[...table.values()]]));
 const admin=users.find((u:any)=>u.role==='admin');
 return {schemaVersion:1,source:'yifun-crm',generated_at:new Date().toISOString(),admin_viewer_id:admin?.id||null,stage_labels:PROJECT_STAGES,delivery_stages:DELIVERY_STAGES,records,viewers};
}
