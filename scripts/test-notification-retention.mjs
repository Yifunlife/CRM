import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {database,moduleURL} from './test-form-intake.mjs';
const {cleanupReadNotifications}=await import(moduleURL('lib/notification-retention.ts'));
const {notificationEndpoint}=await import(moduleURL('lib/followup-notifications.ts'));
const {salesSuiteEndpoint}=await import(moduleURL('lib/sales-suite-server.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),user={id:'sales',role:'sales'},admin={id:'admin',role:'admin'},at=new Date(Math.floor(Date.now()/1000)*1000).toISOString(),cutoff=Date.parse(at)-86400000;
for(const u of [user,admin])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused',at);
sql.prepare("INSERT INTO crm_leads(id,name,owner_id,source,detail,fingerprint,created) VALUES('lead','Customer','sales','Meta','{}','lead',?)").run(at);
sql.prepare("INSERT INTO crm_followup_orders(id,order_number,project,lead_id,commercial_id,logistics_id,details,steps,change_token,created,created_by,updated,updated_by) VALUES('order','Order','Project','lead','sales','sales','{}','[]','token',?,'admin',?,'admin')").run(at,at);
const add=(type,id,read,created='2020-01-01')=>{const foreign=type==='followup'?'order_id':'lead_id';return db.prepare(`INSERT INTO crm_${type}_notifications(id,dedupe_key,${foreign},recipient_id,title,content,created,read_at) VALUES(?,?,?,'sales','Title','Private message',?,?)`).bind(type+':'+id,id,type==='followup'?'order':'lead',created,read).run();};
for(const type of ['followup','lead','sales']){
 await add(type,'old',new Date(cutoff-1000).toISOString());await add(type,'boundary',new Date(cutoff+11*3600000).toISOString().replace('Z','+11:00'));
 await add(type,'recent',new Date(cutoff+60000).toISOString());await add(type,'old-created-read-now',at);await add(type,'unread','');await add(type,'invalid','unknown');await add(type,'future','2099-01-01');
}
const call=(u=user,path='followup-notifications')=>notificationEndpoint(db,u,u,path,'GET',{});
const before=JSON.stringify(['crm_leads','crm_notes','crm_assignments','crm_followup_orders','crm_sales_tasks'].map(t=>sql.prepare('SELECT * FROM '+t).all()));
for(const response of [await call(),await call(admin,'followup-notifications/audit')]){assert(!response.notifications.some(n=>n.dedupe_key==='old'||n.dedupe_key==='boundary'));assert(response.notifications.some(n=>n.dedupe_key==='unread'));assert(response.notifications.some(n=>n.dedupe_key==='old-created-read-now'));}
const salesInbox=await salesSuiteEndpoint(db,undefined,user,user,'sales-suite/report','GET',{},new URL('https://fixture.invalid/'));assert(!salesInbox.notifications.some(n=>n.dedupe_key==='old'||n.dedupe_key==='boundary'));assert(salesInbox.notifications.some(n=>n.dedupe_key==='unread'));
assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_notification_deduplication').get().n,0,'GET only hides expired notices and does not write');
const result=await cleanupReadNotifications(db,at);assert.equal(result.deleted,6);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_notification_deduplication').get().n,6);
for(const type of ['followup','lead','sales']){
 assert.equal(sql.prepare(`SELECT COUNT(*) n FROM crm_${type}_notifications`).get().n,5);
 assert.equal((await add(type,'old','')).meta.changes,0,'deleted message cannot reappear through INSERT OR IGNORE producers');
 const foreign=type==='followup'?'order_id':'lead_id';await db.prepare(`INSERT INTO crm_${type}_notifications(id,dedupe_key,${foreign},recipient_id,title,content,created) VALUES(?,'old',?,'sales','Regenerated','Hidden',?) ON CONFLICT(dedupe_key) DO UPDATE SET title=excluded.title`).bind(type+':repeated',type==='followup'?'order':'lead',at).run();
 assert.equal(sql.prepare(`SELECT COUNT(*) n FROM crm_${type}_notifications WHERE dedupe_key='old'`).get().n,0,'daily reminder UPSERT cannot regenerate expired delivery');
 await add(type,'new-event','');assert.equal(sql.prepare(`SELECT COUNT(*) n FROM crm_${type}_notifications WHERE dedupe_key='new-event'`).get().n,1);
}
assert.equal((await cleanupReadNotifications(db,at)).deleted,0,'repeated cleanup is idempotent');
assert.equal(before,JSON.stringify(['crm_leads','crm_notes','crm_assignments','crm_followup_orders','crm_sales_tasks'].map(t=>sql.prepare('SELECT * FROM '+t).all())));assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
console.log('PASS: 24-hour read-time boundary and timezone offsets; old-created/recent-read, unread, invalid and future preservation; own/audit visibility before cleanup; three physical inbox deletions; no old-message regeneration; new events allowed; GET read-only, idempotence and business records preserved.');
