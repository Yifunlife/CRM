import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {personalWorkEndpoint:handle}=await import(moduleURL('lib/personal-work-server.ts'));
const {day,addDays,openingSchedule,projectFinancials,personalTodoDue}=await import(moduleURL('lib/personal-work.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),sales={id:'a',role:'sales',permissions:{customers_all:true}},other={id:'b',role:'sales'},admin={id:'admin',role:'admin'},ceo={id:'ceo',role:'ceo'},today=day(),at=new Date(Date.now()-60000).toISOString();
for(const u of [sales,other,admin,ceo])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused',at);
for(const [id,owner] of [['mine','a'],['foreign','b']])sql.prepare("INSERT INTO crm_leads(id,name,source,owner_id,status,phone,detail,fingerprint,created,cohort) VALUES(?,?,'Meta',?,'正在沟通','123','{\"原始资料\":\"保留\"}',?,?,'new')").run(id,id,owner,id,at);
sql.prepare("INSERT INTO crm_sales_projects(project_id,name,lead_id,stage_at,token,created,created_by,updated,updated_by) VALUES('p','原项目','mine',?,'token',?,'a',?,'a')").run(at,at,at);
sql.prepare("INSERT INTO crm_notes(id,lead_id,user_id,content,method,next_step,created) VALUES('old','mine','a','原首次沟通依据','首次WhatsApp','原下一步',?)").run(at);
const get=(path,user=sales)=>handle(db,user,user,'personal-work/'+path.split('?')[0],'GET',{},new URL('https://test/api/personal-work/'+path));
const post=(path,body,user=sales)=>handle(db,user,user,'personal-work/'+path,'POST',body,new URL('https://test/api/personal-work/'+path));
const base={id:'mine',type:'后续跟进',result:'客户已回复',note:'',next_action:'跟进客户回复',next_date:today,status:'正在沟通',method:'WhatsApp',at};
await assert.rejects(get('customer?id=foreign'),e=>e.status===404);
await assert.rejects(post('record',{...base,id:'foreign'}),e=>e.status===404);
await assert.rejects(post('record',{...base,result:'其他'},ceo),/备注/);
await assert.rejects(post('record',{...base,result:'其他'}),/备注/);
await assert.rejects(post('record',{...base,result:'设计已下单'}),/出方案/);

await assert.rejects(post('record',{...base,at:'2099-01-01T00:00:00.000Z'}),/未来/);
await post('record',{...base,type:'首次联系'});
assert.equal(JSON.parse(sql.prepare("SELECT detail FROM crm_leads WHERE id='mine'").get().detail)['原始资料'],'保留');
assert.ok(JSON.parse(sql.prepare("SELECT detail FROM crm_leads WHERE id='mine'").get().detail)._sales_progress.first.whatsapp);
const date=addDays(today,2);
await post('record',{...base,at:new Date(Date.now()-50000).toISOString(),result:'设计已下单',next_action:'跟进设计进度',proposal_date:date});
let report=await get('report');assert.equal(report.reminders.find(r=>r.kind==='设计出方案').date,date);assert.equal(report.reminders.find(r=>r.kind==='设计出方案').rank,1);
await post('record',{...base,at:new Date(Date.now()-40000).toISOString()});
assert.equal((await get('report')).reminders.find(r=>r.kind==='设计出方案').date,date,'ordinary follow-up retains the deadline');
await post('record',{...base,at:new Date(Date.now()-30000).toISOString(),next_action:'跟进设计进度',proposal_date:addDays(today,-1)});
assert.equal((await get('report')).reminders.find(r=>r.kind==='设计出方案').rank,0);
await post('record',{...base,at:new Date(Date.now()-20000).toISOString(),result:'方案已发送，等待反馈'});
assert.ok(!(await get('report')).reminders.some(r=>r.kind==='设计出方案'));
const history=await get('customer?id=mine&type='+encodeURIComponent('首次联系'));assert.equal(history.matched,2);assert.equal(history.total,6);assert.ok(history.rows.some(r=>r.id==='old'));
const page=await get('customer?id=mine&page=2');assert.equal(page.rows.length,1);assert.equal(page.pages,2);
const plan={entity:'sales:p',opening:addDays(today,90),phase:1,remaining:30,days:[10,30,35,10,7],buffer:7,remind:7};
await post('plan',{id:'mine',revision:'',plan});await assert.rejects(post('plan',{id:'mine',revision:'',plan}),e=>e.status===409);
await assert.rejects(post('plan',{id:'foreign',revision:'',plan}),e=>e.status===404);
await post('priority',{id:'mine',entity:'sales:p',marked:true});assert.deepEqual((await get('report')).priorities,['sales:p']);await post('priority',{id:'mine',entity:'sales:p',marked:false});assert.deepEqual((await get('report')).priorities,[]);
const previousState=JSON.parse(sql.prepare("SELECT detail FROM crm_leads WHERE id='mine'").get().detail)._sales_progress;
await post('record',{...base,result:'设计已下单',proposal_date:date,at:new Date(Date.now()-3600000).toISOString()});
const afterBackfill=JSON.parse(sql.prepare("SELECT detail FROM crm_leads WHERE id='mine'").get().detail)._sales_progress;
assert.equal(afterBackfill.reply_at,previousState.reply_at);assert.equal(afterBackfill.stage_at,previousState.stage_at,'backfilled history must not replace a newer stage');
const before=JSON.stringify(sql.prepare('SELECT * FROM crm_sales_events ORDER BY rowid').all());await get('report');await get('customer?id=mine');assert.equal(JSON.stringify(sql.prepare('SELECT * FROM crm_sales_events ORDER BY rowid').all()),before,'reads do not create notices or modify history');
assert.ok(!(await get('report',other)).reminders.length);
const noProject=await get('customer?id=foreign',other);assert.equal(noProject.choices[0].key,'customer:foreign');await post('plan',{id:'foreign',revision:'',plan:{...plan,entity:'customer:foreign'}},other);assert.equal((await get('customer?id=foreign',other)).plans.length,1,'opening date can be entered in a customer archive before project creation');assert.equal(sql.prepare("SELECT count(*) n FROM crm_notes WHERE id='old'").get().n,1);
const schedule=openingSchedule(plan,today);assert.equal(schedule.latest.at(-1).finish,addDays(plan.opening,-7));assert.equal(schedule.latest[1].finish,addDays(plan.opening,-59));
assert.deepEqual(projectFinancials({deal_id:'d'},[{id:'d',total_minor:1200000,currency:'USD'}],[{deal_id:'d',amount_minor:800000,refunded_minor:10000,currency:'USD'}]),{currency:'USD',amount:1200000,received:790000,outstanding:410000});
assert.equal(projectFinancials({deal_id:'d'},[{id:'d',total_minor:1200000,currency:'USD'}],[{deal_id:'d',amount_minor:1,refunded_minor:0,currency:'CNY'}]).received,null);
console.log('PASS: own-customer access, structured follow-up, preserved history, paged filters, first-contact evidence, design deadlines/overdue/closure, opening reverse plans, persistent priority, read-only reports and verified money/refunds/currency isolation.');

// Today's assignments appear even when the inquiry predates today. A desktop link is the receipt.
const old='2026-01-01T00:00:00.000Z',stamp=today+'T00:00:00+08:00';
for(const [id,owner,policy,linkedOwner,created] of [
 ['assigned-old','a','full-first-v1','a',old],['waiting','a','manual-v1','',old],
 ['alignment','a','historical-alignment','',old],['sheet','a','historical-sheet-v1','',old],
 ['foreign-assignment','b','full-first-v1','b',old],['stale-link','a','full-first-v1','b',old],
 ['created-and-assigned','a','full-first-v1','',stamp],['yesterday','a','full-first-v1','',old]
]){
 sql.prepare("INSERT INTO crm_leads(id,name,source,owner_id,detail,fingerprint,created,cohort) VALUES(?,?,'Meta',?,'{}',?, ?,?)").run(id,id,owner,id,created,id==='created-and-assigned'?'new':'historical');
 sql.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES(?,?,'admin',?,?,?)").run(id,id,owner,id==='yesterday'?old:stamp,policy);
 if(linkedOwner)sql.prepare("INSERT INTO crm_workbench_links(lead_id,owner_id,desktop_id,created,created_by) VALUES(?,?,?,?, 'admin')").run(id,linkedOwner,'desktop-'+id,stamp);
}
sql.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES('duplicate-event','assigned-old','admin','a',?,'manual-v1')").run(stamp);
const tables=['crm_leads','crm_assignments','crm_workbench_links','crm_notes','crm_sales_events'];
const preserved=()=>JSON.stringify(tables.map(t=>sql.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()));
const beforeReport=preserved(),inbox=(await get('report')).newLeads;
assert.deepEqual(inbox.map(l=>l.id).sort(),['mine','assigned-old','waiting','stale-link','created-and-assigned'].sort());
assert.equal(inbox.find(l=>l.id==='assigned-old').workbench_added,1);
assert.equal(inbox.find(l=>l.id==='stale-link').workbench_added,0);
assert.equal(inbox.find(l=>l.id==='waiting').workbench_added,0);
assert.equal(inbox.filter(l=>l.id==='created-and-assigned').length,1);
assert.equal(preserved(),beforeReport,'report preserves cohort, ownership, allocation and contact history');
assert.deepEqual((await get('report',other)).newLeads.map(l=>l.id).sort(),['foreign','foreign-assignment'].sort());
console.log('PASS: today-assigned historical inquiries, confirmed/pending desktop receipts, owner isolation, historical alignment exclusion, previous-day exclusion, deduplication and read-only status.');

// The personal today list is a deadline queue, not a list of missing scheduling fields.
const {homeCustomer}=await import(moduleURL('lib/sales-home.ts'));
const contactAt=today+'T02:00:00+08:00';
const firstContact={id:'contacted-today',cohort:'new',status:'已联系待回复',phone:'123',email:'',assigned_at:contactAt,next_date:'',detail:{_sales_progress:{first:{whatsapp:{at:contactAt,note:'首次联系'}},second:{}}}};
const waiting=homeCustomer(firstContact,contactAt);
assert.ok(waiting.tags.includes('unscheduled'));
assert.ok(waiting.due>today,'the existing second-contact date remains in the future');
assert.equal(personalTodoDue(waiting.due,today),false,'first contact today is not a today task');
assert.equal(personalTodoDue('',today),false,'no date does not mean due today');
assert.equal(personalTodoDue(addDays(today,1),today),false,'future order tasks stay out of today');
assert.equal(personalTodoDue(today,today),true);
assert.equal(personalTodoDue(addDays(today,-1),today),true);
assert.equal(personalTodoDue('invalid',today),false);
console.log('PASS: first contact waiting for reply, missing dates and future tasks stay out of today; real today and overdue follow-ups remain.');

sql.prepare("UPDATE crm_sales_projects SET next_date=?,next_action='Review design' WHERE project_id='p'").run(today);
assert.equal((await get('report')).projects.find(p=>p.project_id==='p').next_action,'Review design');
assert.equal((await get('report',other)).projects.length,0,'project reminders remain owner scoped even for a broadly permitted salesperson');
sql.prepare("UPDATE crm_sales_projects SET stage='won' WHERE project_id='p'").run();
assert.equal((await get('report')).projects.some(p=>p.project_id==='p'),false,'completed sales projects leave next-step reminders');
const currentPlan=(await get('customer?id=mine')).plans.find(p=>p.entity==='sales:p');
await post('plan',{id:'mine',revision:currentPlan.revision,plan:{...plan,opening:addDays(today,-1),phase:4,remaining:0}});
assert.equal((await get('report')).reminders.some(r=>r.id==='opening:sales:p'),false,'an opening plan with its last phase completed does not remain overdue');
console.log('PASS: owner-scoped project next actions, completed sales projects and completed opening plans automatically leave current reminders.');

await post('record',{...base,status:'已成交'});assert.equal(sql.prepare("SELECT status FROM crm_leads WHERE id='mine'").get().status,'已成交');console.log('PASS: personal customer status does not require administrator deal confirmation.');

// The intake list uses the same recorded platform rules as customer management.
const sourceCases=[
 ['wa-alias','WhatsApp／其他','WhatsApp／其他',{},'WhatsApp'],
 ['fb','Meta','fb',{},'Facebook'],
 ['ig','Meta','',{platform:'ig'},'Instagram'],
 ['pending','Meta','',{},'平台待确认'],
 ['override','WhatsApp／其他','WhatsApp／其他',{_source_override:'他人介绍'},'他人介绍']
];
for(const [id,source,channel,detail] of sourceCases)sql.prepare("INSERT INTO crm_leads(id,name,source,channel,detail,fingerprint,owner_id,created,cohort) VALUES(?,?,?,?,?,?,'a',?,'new')").run('source-'+id,'Source fixture',source,channel,JSON.stringify(detail),'source-'+id,stamp);
const beforeSources=preserved(),sourceReport=(await get('report')).newLeads;
for(const [id,source,channel,,expected] of sourceCases){
 const row=sourceReport.find(l=>l.id==='source-'+id);
 assert.equal(row.display_source,expected);
 assert.equal(row.source,source);
 assert.equal(row.channel,channel);
}
assert.equal(preserved(),beforeSources,'source display does not rewrite recorded source, ownership or history');
console.log('PASS: personal intake resolves Facebook, Instagram, WhatsApp, explicit overrides and unknown platforms without rewriting customer data.');
