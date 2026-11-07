import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {visitReceptionEndpoint:handle,receptionReminders}=await import(moduleURL('lib/visit-reception-server.ts'));
const {personalWorkEndpoint}=await import(moduleURL('lib/personal-work-server.ts'));
const {emptyVisit,visitCents,expenseSummary,VISIT_TIMES}=await import(moduleURL('lib/visit-reception.ts'));
const {passwordHash,digest}=await import(moduleURL('lib/crm.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),a={id:'visit-a',name:'接待业务员甲',role:'sales'},b={id:'visit-b',name:'接待业务员乙',role:'sales'},admin={id:'visit-admin',name:'接待管理测试',role:'admin'},readonly={id:'visit-reader',role:'operations',permissions:{customers_all:true,customers_edit:false}},photographer={id:'visit-photo',name:'摄影负责人',role:'design'},at=new Date().toISOString();
for(const u of [a,b,admin,readonly,photographer])sql.prepare("INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)").run(u.id,u.id,u.name||u.id,u.role,await passwordHash('VisitTest-2026'),at);
sql.exec("UPDATE crm_users SET trade_scopes='[\"domestic\",\"foreign\"]' WHERE role='sales'");
for(const [id,owner,name] of [['visit-client-a',a.id,'接待演示客户 A'],['visit-client-b',b.id,'接待演示客户 B']])sql.prepare("INSERT INTO crm_leads(id,name,country,source,owner_id,detail,fingerprint,created) VALUES(?,?,'斯洛文尼亚','他人介绍',?,'{\"项目面积\":\"1450\"}',?,?)").run(id,name,owner,id,at);
const get=(path='',u=a)=>handle(db,u,u,'visit-receptions'+path.split('?')[0],'GET',{},new URL('https://test/api/visit-receptions'+path));
const post=(body,u=a)=>handle(db,u,u,'visit-receptions','POST',body,new URL('https://test/api/visit-receptions'));
const own=await get('/customers?q=接待演示');assert.equal(own.rows.length,1);assert.equal(own.rows[0].area,'1450');
assert.equal((await get('/options')).people.find(p=>p.id===photographer.id).name,'摄影负责人');assert.equal(Object.keys((await get('/options')).people[0]).sort().join(','),'id,name,role');
let v={...emptyVisit(a.id),lead_id:'visit-client-a',date:at.slice(0,10),welcome:'Welcome!'};
v.itinerary[0].people=[a.id,photographer.id];v.expenses[0].expected='100.10';v.expenses[1].expected='200.20';
assert.equal(VISIT_TIMES.length,48);assert.equal(VISIT_TIMES[47],'23:30');assert.equal(visitCents('0'),0);assert.equal(visitCents(''),null);assert.equal(visitCents('0.29'),29);assert.throws(()=>visitCents('-1'));assert.throws(()=>visitCents('1.234'));
const original=JSON.stringify(sql.prepare('SELECT * FROM crm_leads ORDER BY id').all());
await assert.rejects(post({...v,lead_id:'visit-client-b'}),e=>e.status===404);
await assert.rejects(post({...v,itinerary:[{...v.itinerary[0],start:'09:20'}]}),/半小时/);
await assert.rejects(post({...v,itinerary:[{...v.itinerary[0],start:'10:00',end:'09:30'}]}),/结束/);
await assert.rejects(post({...v,itinerary:[{...v.itinerary[0],people:['missing']}]}),/人员/);
await assert.rejects(post({...v,expenses:[{category:'餐饮',expected:'-1',actual:''}]}),/非负/);
await assert.rejects(post(v,readonly),e=>e.status===403);
let saved=await post(v);v={...v,revision:saved.revision};
assert.equal((await receptionReminders(db,a.id)).length,0,'pre-registration creates no reminder');
await assert.rejects(post({...v,revision:''}),e=>e.status===409);
await assert.rejects(get('?id='+v.id,b),e=>e.status===404);
assert.equal(sql.prepare('SELECT count(*) n FROM crm_notes').get().n,0,'planning never manufactures contact evidence');
assert.equal(sql.prepare('SELECT count(*) n FROM crm_receipts').get().n,0,'reception costs are not customer receipts');
assert.equal(JSON.stringify(sql.prepare('SELECT * FROM crm_leads ORDER BY id').all()),original);
v={...v,receptionist_id:b.id,completed:true};saved=await post(v);v={...v,revision:saved.revision};
assert.equal((await receptionReminders(db,a.id)).length,0);let tasks=await receptionReminders(db,b.id);assert.equal(tasks.length,1);assert.deepEqual(tasks[0].missing,['餐饮','交通（打车）','住宿']);assert.equal(tasks[0].expected,30030);
assert.equal((await get('?id='+v.id,b)).rows[0].can_assign,false);
await assert.rejects(post({...v,receptionist_id:a.id},b),e=>e.status===403);
const personal=(u)=>personalWorkEndpoint(db,u,u,'personal-work/report','GET',{},new URL('https://test/api/personal-work/report'));
assert.equal((await personal(b)).receptionExpenses[0].id,v.id);assert.equal((await personal(a)).receptionExpenses.length,0);
const {salesWorkflowEndpoint}=await import(moduleURL('lib/sales-workflow-server.ts'));const meetingView=await salesWorkflowEndpoint(db,admin,admin,'sales-management/customers','GET',{},new URL('https://test/api/sales-management/customers'));assert.equal(meetingView.meetings.filter(m=>m.visit_id===v.id).length,1,'completed receptions appear once in the existing customer visit view');const timeline=await personalWorkEndpoint(db,a,a,'personal-work/customer','GET',{},new URL('https://test/api/personal-work/customer?id=visit-client-a'));assert.equal(timeline.rows.filter(r=>r.type==='到访登记').length,1,'archive history shows latest reception once, not every expense audit');
const auditBefore=sql.prepare('SELECT count(*) n FROM crm_sales_events').get().n;
v={...v,expenses:v.expenses.map((r,i)=>({...r,actual:i===0?'88.90':''}))};saved=await post(v,b);v={...v,revision:saved.revision};
assert.equal((await receptionReminders(db,b.id))[0].actual,8890);assert.equal((await receptionReminders(db,b.id))[0].missing.length,2);
await assert.rejects(post({...v,revision:'stale'},b),e=>e.status===409);assert.equal(sql.prepare('SELECT count(*) n FROM crm_sales_events').get().n,auditBefore+1);
v={...v,expenses:v.expenses.map(r=>({...r,actual:r.actual||'0'}))};saved=await post(v,b);v={...v,revision:saved.revision};assert.equal((await personal(b)).receptionExpenses.length,0,'zero is explicitly completed');
v={...v,expenses:v.expenses.map((r,i)=>({...r,actual:i===1?'':r.actual}))};saved=await post(v,b);v={...v,revision:saved.revision};assert.deepEqual((await receptionReminders(db,b.id))[0].missing,['交通（打车）']);
v={...v,expenses:[]};saved=await post(v,b);v={...v,revision:saved.revision};assert.equal((await receptionReminders(db,b.id)).length,0,'removed rows need no reminder');
// Concurrent writes must preserve one winner and one audit entry.
let concurrent=await Promise.allSettled([post({...v,result:'版本一'},b),post({...v,result:'版本二'},b)]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(concurrent.find(r=>r.status==='rejected').reason.status,409);
// Assigned reception staff can still settle this specific visit after customer transfer.
v=(await get('?id='+v.id,b)).rows[0];sql.prepare('UPDATE crm_leads SET owner_id=? WHERE id=?').run(admin.id,v.lead_id);
await assert.rejects(get('?id='+v.id,a),e=>e.status===404);await post({...v,result:'接待员仍可补全本次接待'},b);
// Preserve inactive historical participants without allowing new inactive assignments.
sql.prepare('UPDATE crm_users SET active=0 WHERE id=?').run(photographer.id);v=(await get('?id='+v.id,b)).rows[0];await post({...v,result:'保留原陪同记录'},b);
await assert.rejects(post({...emptyVisit(a.id),lead_id:'visit-client-a',date:at.slice(0,10),itinerary:[{...v.itinerary[0],people:[photographer.id]}]},admin),/人员/);
// A seeded pending reception for authenticated local browser verification.
let fixture={...emptyVisit(b.id),lead_id:'visit-client-b',date:at.slice(0,10),welcome:'Welcome to YIFUN LIFE!',photography:true,management:true,gift:true,completed:true};fixture.itinerary[0].people=[b.id];fixture.expenses[0].expected='300';fixture.expenses[1].expected='150';fixture.expenses[2].expected='800';fixture.expenses[0].actual='288';await post(fixture,b);
if(process.env.CRM_VISIT_FIXTURE){
 const cookie='visit-browser-fixture';sql.prepare('INSERT INTO crm_sessions(token,user_id,expires) VALUES(?,?,?)').run(await digest(cookie),b.id,Date.now()+86400000);
 let dump='';for(const table of sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
  const cols=sql.prepare('PRAGMA table_info('+table.name+')').all().map(c=>c.name);for(const row of sql.prepare('SELECT * FROM '+table.name).all())dump+='INSERT OR REPLACE INTO '+table.name+'('+cols.join(',')+') VALUES('+cols.map(c=>row[c]===null?'NULL':typeof row[c]==='number'?String(row[c]):"'"+String(row[c]).replaceAll("'","''")+"'").join(',')+');\n';
 }writeFileSync(process.env.CRM_VISIT_FIXTURE,dump);
}
console.log('PASS visit reception: isolated history, real staff selectors, half-hour itinerary, exact decimal costs, zero/missing distinction, save/edit/conflict/ownership, completed-only assigned My Work reminders and clear/reappear, inactive history retention.');
