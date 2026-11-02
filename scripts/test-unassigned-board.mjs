import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {database,moduleURL} from './test-form-intake.mjs';
const {allocationManagementEndpoint:run}=await import(moduleURL('lib/allocation-management.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),admin={id:'admin',role:'admin'},ceo={id:'ceo',role:'ceo'};
for(const u of [admin,ceo,{id:'sales',role:'sales'}])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-01-01');
function lead(id,entered,owner=null,original='',review=0,cohort='unknown'){sql.prepare("INSERT INTO crm_leads(id,name,source,entered,owner_id,original_owner,review,cohort,detail,fingerprint,created) VALUES(?,?,'Meta',?,?,?,?,?,'{}',?,'2026-11-02')").run(id,id,entered,owner,original,review,cohort,id);}
lead('before','2026-10-28T15:59:59Z');lead('first','2026-10-28T16:00:00Z');lead('last','2026-11-02T15:59:59Z');lead('after','2026-11-02T16:00:00Z');lead('review','2026-10-30',null,'',1);lead('owned','2026-10-30','sales');lead('original','2026-10-30',null,'Original owner');lead('unknown','',null,'',0,'unknown');lead('simulation','2026-10-30');lead('cancelled-test','2026-10-30');
sql.prepare("INSERT INTO crm_assignments(id,lead_id,user_id,owner_id,created,policy) VALUES('test','simulation','admin','sales','2026-10-30','test-simulation')").run();
sql.prepare("INSERT INTO crm_workflow_audit VALUES('cancel','撤销客资分配','cancelled-test',?,'2026-11-02','admin')").run(JSON.stringify({assignments:[{policy:'test-simulation'}]}));
for(let i=0;i<305;i++)sql.prepare("INSERT INTO crm_customer_pool(id,source,raw,payload,state,created,updated,created_by) VALUES(?,'Meta','{}',?,'待确认',?,'2026-11-02','admin')").run('pool-'+i,JSON.stringify({name:'P'+i}),i===304?'2026-11-02T15:59:59Z':'2026-10-29T00:00:00Z');
sql.prepare("INSERT INTO crm_customer_pool(id,source,raw,payload,state,target_lead_id,created,updated,created_by) VALUES('owned-enquiry','Meta','{}','{}','待确认','owned','2026-10-30','2026-11-02','admin')").run();
const changes=sql.prepare('SELECT total_changes() n').get().n;
const get=(params='',user=admin)=>run(db,user,user,'allocation/management','GET',{},new URL('https://test/?from=2026-10-29&to=2026-11-02'+params));
const first=await get();assert.equal(first.total,308);assert.equal(first.rows.length,30);assert.equal(first.from,'2026-10-29');assert.equal(first.to,'2026-11-02');
const found=[];for(let page=1;page<=first.pages;page++){const result=await get('&page='+page);found.push(...result.rows);assert.equal(result.total,308);}
assert.equal(new Set(found.map(r=>r.id)).size,308);assert(found.some(r=>r.id==='first'&&r.cohort==='historical'));assert(found.some(r=>r.id==='last'));assert(found.some(r=>r.id==='review'));assert(found.some(r=>r.id==='intake:pool-304'));for(const id of ['before','after','owned','original','unknown','simulation','cancelled-test','intake:owned-enquiry'])assert(!found.some(r=>r.id===id),id);
assert.equal((await get('',ceo)).total,308);assert.equal((await get('&q=first')).total,1);
const all=await run(db,admin,admin,'allocation/management','GET',{},new URL('https://test/?from=&to='));assert.equal(all.total,311);
await assert.rejects(run(db,admin,admin,'allocation/management','GET',{},new URL('https://test/?from=invalid&to=2026-11-02')),e=>e.status===400);await assert.rejects(run(db,admin,admin,'allocation/management','GET',{},new URL('https://test/?from=2026-11-02&to=2026-10-29')),e=>e.status===400);
assert.equal(sql.prepare('SELECT total_changes() n').get().n,changes);console.log('PASS: all ownerless cohorts and review records, Beijing date boundaries, source ownership and simulations excluded, complete pagination beyond 300 pool entries, CEO read access, search, date validation and zero database writes.');
