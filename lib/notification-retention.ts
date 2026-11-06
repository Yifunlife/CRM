import {now} from './crm';

export function visibleNotificationsSQL(alias='n'){
 return `(${alias}.read_at='' OR julianday(${alias}.read_at) IS NULL OR julianday(${alias}.read_at)>julianday('now','-1 day'))`;
}

export async function cleanupReadNotifications(db:D1Database,at=now()){
 const cutoff=new Date(Date.parse(at)-24*60*60*1000).toISOString();
 const statements:D1PreparedStatement[]=[];
 for(const type of ['followup','lead','sales']){
  const table='crm_'+type+'_notifications',expired="read_at<>'' AND julianday(read_at)<=julianday(?)";
  statements.push(db.prepare(`INSERT OR IGNORE INTO crm_notification_deduplication(notification_type,dedupe_key) SELECT ?,dedupe_key FROM ${table} WHERE ${expired}`).bind(type,cutoff));
  statements.push(db.prepare(`DELETE FROM ${table} WHERE ${expired}`).bind(cutoff));
 }
 const results=await db.batch(statements);
 return {deleted:results.reduce((n,r,i)=>n+(i%2?Number(r.meta.changes||0):0),0),cutoff};
}
