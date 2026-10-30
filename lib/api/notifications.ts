import { can } from '../crm';
import { notificationEndpoint } from '../followup-notifications';
import { salesSuiteEndpoint } from '../sales-suite-server';
import type { ApiContext } from './context';
import { json } from './http';
export async function notifications({db,env,req,url,path,body,user,actor}:ApiContext):Promise<Response|undefined>{
  if(path==='followup-notifications/read'&&req.method==='POST'&&await db.prepare('SELECT id FROM crm_sales_notifications WHERE id=?').bind(String(body.id||'')).first())return json(await salesSuiteEndpoint(db,env.QUOTE_DB,user,actor,'sales-suite/notices/read','POST',body,url));
  const notificationResult=await notificationEndpoint(db,user,actor,path,req.method,body);if(notificationResult!==undefined){if(req.method==='GET'&&user.role!=='followup'){const ns=(await db.prepare("SELECT n.*,u.name AS recipient_name,'站内' AS channel FROM crm_sales_notifications n JOIN crm_users u ON u.id=n.recipient_id JOIN crm_leads l ON l.id=n.lead_id WHERE "+(path.endsWith('/audit')&&can(user,'customers_all')?'1=1':"n.recipient_id=? AND (l.owner_id=? OR EXISTS(SELECT 1 FROM crm_sales_tasks t WHERE t.id=n.task_id AND t.owner_id=?)"+(can(user,'customers_all')?' OR 1=1':'')+")")+" ORDER BY n.created DESC LIMIT 200").bind(...(path.endsWith('/audit')&&can(user,'customers_all')?[]:[user.id,user.id,user.id])).all()).results;(notificationResult as any).notifications=[...(notificationResult as any).notifications,...ns].sort((a:any,b:any)=>Number(!b.read_at)-Number(!a.read_at)||b.created.localeCompare(a.created)).slice(0,200);}return json(notificationResult);}
}
