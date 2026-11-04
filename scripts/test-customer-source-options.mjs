import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';
const {CUSTOMER_SOURCE_OPTIONS,customerSource}=await import(moduleURL('lib/customer-source.ts'));
const {customerPoolEndpoint:pool}=await import(moduleURL('lib/customer-pool.ts'));
const {customerPage}=await import(moduleURL('lib/customer-page.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),user={id:'ceo',role:'ceo'};
sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(user.id,user.id,user.id,user.role,'unused','2026-11-04');
assert.deepEqual(CUSTOMER_SOURCE_OPTIONS,['Facebook','Instagram','Google 广告','抖音','独立站','WhatsApp','阿里','小红书','微信','他人介绍']);
assert.equal(customerSource({source:'Meta',detail:{}}),'平台待确认');
assert.equal(customerSource({source:'Meta',detail:{platform:'fb'}}),'Facebook');
for(const source of ['WhatsApp','WhatsApp／其他','WhatsApp/其他','WhatsApp 自动同步'])assert.equal(customerSource({source}),'WhatsApp');
const request=(path,body)=>pool(db,user,user,'customer-pool/'+path,'POST',body);
for(const [i,source,scope] of [[1,'小红书','xiaohongshu'],[2,'微信','wechat'],[3,'他人介绍','referral']]){
 const id='new-source-intake-000'+i;
 await request('submit',{id,source,raw:'隔离测试资料',fields:{name:'示例'+source,phone:'1380000000'+i,email:'source'+i+'@example.invalid',business_scope:scope,requirement:'测试需求'}});
 await request('confirm',{id,version:0,fields:{name:'示例'+source,phone:'1380000000'+i,email:'source'+i+'@example.invalid',business_scope:scope,requirement:'测试需求'}});
 const saved=sql.prepare('SELECT * FROM crm_leads WHERE id=?').get(id);assert.equal(saved.source,source);assert.equal(saved.business_scope,scope);
 const report=await customerPage(db,user,new URL('https://test.invalid/?source='+encodeURIComponent(source)));assert.equal(report.total,1);assert.equal(report.rows[0].display_source,source);
}
for(const [i,source] of ['WhatsApp','WhatsApp／其他','WhatsApp 自动同步'].entries())sql.prepare("INSERT INTO crm_leads(id,name,source,detail,fingerprint,created) VALUES(?,?,?,'{}',?,'2026-11-04')").run('wa'+i,'示例WhatsApp',source,'wa'+i);
const before=JSON.stringify(sql.prepare('SELECT * FROM crm_leads ORDER BY id').all());
const wa=await customerPage(db,user,new URL('https://test.invalid/?source=WhatsApp'));assert.equal(wa.total,3);assert(wa.rows.every(r=>r.display_source==='WhatsApp'));
assert.equal(JSON.stringify(sql.prepare('SELECT * FROM crm_leads ORDER BY id').all()),before);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_workbench_commands').get().n,0);assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
console.log('PASS: approved source choices; three new sources submit/confirm/filter; historical WhatsApp aliases filter together; Meta remains unguessed; raw records preserved.');
