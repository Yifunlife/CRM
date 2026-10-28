import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'crm-operations-'));
try{
 await build({entryPoints:['lib/operations-report.ts','lib/customer-changes.ts'],bundle:true,platform:'node',format:'esm',outdir:dir,logLevel:'silent',outExtension:{'.js':'.mjs'}});
 const {operationsReport}=await import('file://'+join(dir,'operations-report.mjs')),{customerChange,customerChanges}=await import('file://'+join(dir,'customer-changes.mjs'));
 const lead=(id,date,grade='',extra={})=>({id,name:id,created:date+'T01:00:00Z',entered:date,grade,status:'正在沟通',last_contact:'',...extra});
 const leads=[lead('old','2026-09-01'),lead('old-repeat','2026-10-10'),lead('a','2026-10-02','A',{last_contact:'2026-10-03'}),lead('a-repeat','2026-11-02'),lead('b','2026-10-03','B'),lead('c','2026-10-04'),lead('unconfirmed-copy','2026-10-05')];
 const campaigns=[{id:'ad',name:'广告A',currency:'USD'},{id:'ad2',name:'广告B',currency:'CNY'}],attrs=leads.map(l=>({lead_id:l.id,source_kind:'广告活动',campaign_id:l.id==='a-repeat'?'ad2':'ad'}));
 const subjects=[{lead_id:'old',subject_id:'old'},{lead_id:'old-repeat',subject_id:'old'},{lead_id:'a',subject_id:'a'},{lead_id:'a-repeat',subject_id:'a'}];
 const deals=[{id:'d1',lead_id:'a',deal_date:'2026-11-01'},{id:'d2',lead_id:'a-repeat',deal_date:'2026-11-02'},{id:'cancel',lead_id:'b',deal_date:'2026-10-04',cancelled:1},{id:'before',lead_id:'b',deal_date:'2026-09-01'},{id:'future',lead_id:'b',deal_date:'2027-01-01'}];
 const quality=[{lead_id:'a',state:'有效'},{lead_id:'b',state:'有效'},{lead_id:'c',state:'无效'}],summary=[{key:'ad',currency:'USD',spent_minor:10000},{key:'ad2',currency:'CNY',spent_minor:0}];
 const args={leads,campaigns,attrs,quality,subjects,deals,summary,from:'2026-10-01',to:'2026-10-31',asOf:'2026-12-01',spendRecorded:['ad']};
 let report=operationsReport(args),row=report.rows.find(r=>r.key==='ad');
 assert.equal(row.consultations,5);assert.equal(row.customers,4);assert.equal(row.verified_customers,1);assert.equal(row.unverified_customers,3);assert.equal(row.valid,2);assert.equal(row.invalid,1);assert.equal(row.unchecked,1);assert.equal(row.contacted,1);assert.equal(row.converted,1);assert.equal(row.conversion,.5);assert.equal(row.cost_per_valid_minor,5000);assert.equal(row.grades.A,1);assert.equal(row.grades.B,1);
 assert.equal(report.customers.find(c=>c.lead_id==='a').deals,2);assert(!report.customers.some(c=>c.lead_id==='old-repeat'),'repeat customer is not new');assert.equal(report.rows.find(r=>r.key==='ad2').customers,0);
 assert.equal(operationsReport({...args,asOf:'2026-10-31'}).rows.find(r=>r.key==='ad').converted,0);
 assert.equal(operationsReport({...args,spendRecorded:[]}).rows.find(r=>r.key==='ad').cost_per_valid_minor,null);
 assert.equal(operationsReport({...args,quality:[]}).rows.find(r=>r.key==='ad').conversion,null);
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 class Statement{constructor(s,args=[]){this.sql=s;this.args=args;}bind(...args){return new Statement(this.sql,args);}async all(){return {results:sql.prepare(this.sql).all(...this.args)};}async run(){return {meta:sql.prepare(this.sql).run(...this.args)};}}
 const db={prepare:s=>new Statement(s),batch:async ss=>{sql.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 for(const id of ['sales','other'])sql.prepare("INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,'sales','unused','now')").run(id,id,id);
 for(const id of ['sales','other'])sql.prepare("INSERT INTO crm_leads(id,name,source,owner_id,detail,fingerprint,created) VALUES(?,?,'Meta',?,'{}',?,'2026-10-01')").run(id,id,id,id);
 const update=async(field,value,id='sales')=>db.batch([customerChange(db,{id:'sales'},id,field,value,'客户已回复'),db.prepare(`UPDATE crm_leads SET ${field}=? WHERE id=?`).bind(value,id)]);
 await update('grade','A');await update('grade','B');await update('grade','B');await update('status','正在沟通');await update('grade','C','other');
 const changes=await customerChanges(db,{id:'sales'},false);assert.equal(changes.length,3);assert(changes.every(c=>c.entity_id==='sales'));assert(changes.some(c=>c.payload.before==='A'&&c.payload.after==='B'));assert.equal((await customerChanges(db,{id:'sales'},true)).length,4);assert.equal((await customerChanges(db,{id:'sales'},false,'other')).length,0);
 console.log('PASS: confirmed-identity cohorts, old/repeat exclusion, future/later/cancelled orders, distinct converted customers, zero/missing spend, grade/status audit, no-op and visibility.');
}finally{rmSync(dir,{recursive:true,force:true});}
