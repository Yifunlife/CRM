import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {database,moduleURL} from './test-form-intake.mjs';
const {confirmedAllocationImport:importForm}=await import(moduleURL('lib/allocation-confirmed-import.ts'));
const {customerPage}=await import(moduleURL('lib/customer-page.ts'));
const {customerOrigin}=await import(moduleURL('lib/customer-origin.ts'));
const {customerProfile}=await import(moduleURL('lib/customer-profile.ts'));
const {contactGradeLabel,importCustomerGrade}=await import(moduleURL('lib/contact-kind.ts'));
const {customerPoolEndpoint:pool}=await import(moduleURL('lib/customer-pool.ts'));
const {roleWorkspaceEndpoint}=await import(moduleURL('lib/role-workspace-server.ts'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
const db=database(sql),ceo={id:'ceo',role:'ceo'},sales={id:'sales',role:'sales'};
for(const u of [ceo,sales])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-01-01');
const accounts=['乐园号','玩具号','工厂号'],grades=['A重点客户','B有意向','C不回复','D好友不通过/找不到账号','F已流失','待联系'];
const rows=['抖音','小红书'].flatMap((platform,p)=>accounts.map((account,a)=>({'客户名称':'Domestic '+p+a,'联系方式':'138100000'+p+a,'微信号':'fixture_wechat_'+p+a,'省份':p?'广东省':'江苏省','城市':p?'深圳市':'南京市','来源平台':platform,'接待抖音号':account,'业务员跟进进度':grades[p*3+a],'分配业务员':'sales','录入日期':'2026-11-01'})));
const missing={'客户名称':'Phone required','联系方式':'','微信号':'fixture_wechat_only','邮箱':'fixture@example.invalid','省份':'浙江省','城市':'杭州市','来源平台':'小红书','接待抖音号':'工厂号','业务员跟进进度':'F已流失','分配业务员':'sales'};
const body={confirmed_flow:true,allocation_management:true,allocate:false,form_source:'domestic',rows:[...rows,missing]};
const before=sql.prepare('SELECT COUNT(*) n FROM crm_leads').get().n;
let result=await importForm(db,ceo,ceo,{...body,preview:true});assert.equal(result.inserted,7);assert.equal(result.reviewed,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_leads').get().n,before);assert.equal(result.previewRows[6].kind,'owned');
result=await importForm(db,ceo,ceo,body);assert.equal(result.inserted,7);assert.equal(result.reviewed,0);
for(let i=0;i<rows.length;i++){
 const row=rows[i],saved=sql.prepare('SELECT * FROM crm_leads WHERE name=?').get(row['客户名称']),detail=JSON.parse(saved.detail),profile=customerProfile(saved);
 assert.equal(saved.phone,row['联系方式']);assert.equal(profile.wechat,row['微信号']);assert.equal(profile.province,row['省份']);assert.equal(profile.city,row['城市']);assert.equal(saved.grade,['A','B','','C','D',''][i]);assert.equal(detail['业务员跟进进度'],row['业务员跟进进度']);assert.equal(detail['来源账号'],row['接待抖音号']);assert.equal(customerOrigin(saved).origin_account,row['接待抖音号']);assert.equal(saved.owner_id,'sales');
}
for(const source of ['抖音','小红书'])for(const account of accounts){
 assert.equal(customerOrigin({source,detail:{'接待抖音号':account}}).origin_account,account);
 const page=await customerPage(db,ceo,new URL('https://fixture.invalid/?'+new URLSearchParams({market:'内贸',source,source_account:account})));assert.equal(page.total,source==='小红书'&&account==='工厂号'?2:1);assert(page.rows.every(r=>r.origin_account===account));
}
assert.equal(customerOrigin({source:'抖音',detail:{'来源账号':'乐园号','接待抖音号':'玩具号'}}).origin_account,'待确认');
let page=await customerPage(db,ceo,new URL('https://fixture.invalid/?'+new URLSearchParams({market:'内贸',region:'江苏',source_account:'玩具号'})));assert.equal(page.total,1);assert.equal(page.rows[0].name,'Domestic 01');
page=await customerPage(db,ceo,new URL('https://fixture.invalid/?q=FIXTURE_WECHAT_11'));assert.equal(page.total,1);assert.equal(page.rows[0].grade,'D');
page=await customerPage(db,ceo,new URL('https://fixture.invalid/?'+new URLSearchParams({q:'Phone required',grade:'D',region:'浙江',market:'内贸'})));assert.equal(page.total,1);assert.equal(!!page.rows[0].intake,false);assert.equal(customerProfile(page.rows[0]).wechat,missing['微信号']);assert.equal(page.rows[0].phone,'');
assert.equal(contactGradeLabel('A'),'A重点客户');assert.equal(contactGradeLabel('B'),'B有意向');assert.equal(contactGradeLabel('D'),'D好友不通过/找不到账号');assert.equal(contactGradeLabel('F'),'F已流失');assert.equal(importCustomerGrade('待联系'),'');
// Either WeChat or telephone is enough; email alone is not a usable contact under this rule.
await pool(db,ceo,ceo,'customer-pool/submit','POST',{id:'domestic-no-phone-fixture',source:'抖音',raw:'Synthetic',fields:{name:'No phone',wechat:'fixture_wechat_only',email:'fixture@example.invalid'}});
await assert.rejects(pool(db,ceo,ceo,'customer-pool/submit','POST',{id:'domestic-no-contact-fixture',source:'抖音',raw:'Synthetic',fields:{email:'fixture@example.invalid'}}),/微信号或电话号码/);
const id='domestic-with-phone-fixture',fields={name:'Manual domestic',phone:'13810009999',wechat:'fixture_manual_wechat',province:'江苏省',city:'苏州市',market:'内贸',country:'中国',source_account:'工厂号',grade:'D',business_scope:'douyin-local',requirement:'Synthetic request'};
await pool(db,ceo,ceo,'customer-pool/submit','POST',{id,source:'抖音',raw:'Synthetic',fields});await pool(db,ceo,ceo,'customer-pool/confirm','POST',{id,version:0,fields:{}});
const manual=sql.prepare('SELECT * FROM crm_leads WHERE id=?').get(id);assert.equal(customerProfile(manual).wechat,fields.wechat);assert.equal(customerProfile(manual).province,fields.province);assert.equal(customerOrigin(manual).origin_account,'工厂号');assert.equal(manual.grade,'D');
const target=sql.prepare("SELECT * FROM crm_leads WHERE name='Domestic 00'").get();const patch={id:target.id,revision:0,contacts:[],base:Object.fromEntries(['source','name','country','phone','email','grade','next_date'].map(k=>[k,target[k]])),phone:'',country:target.country,method:'微信',profile:{wechat:'fixture_preserved_wechat'}};
await roleWorkspaceEndpoint(db,ceo,ceo,'role-workspace/customer','POST',patch,new URL('https://fixture.invalid/'));assert.equal(sql.prepare('SELECT phone FROM crm_leads WHERE id=?').get(target.id).phone,'');
const updated=sql.prepare('SELECT * FROM crm_leads WHERE id=?').get(target.id);await assert.rejects(roleWorkspaceEndpoint(db,ceo,ceo,'role-workspace/customer','POST',{...patch,revision:1,base:Object.fromEntries(['source','name','country','phone','email','grade','next_date'].map(k=>[k,updated[k]])),profile:{wechat:''}},new URL('https://fixture.invalid/')),/微信号或电话号码/);
result=await importForm(db,ceo,ceo,{...body,rows:[{...rows[0],'联系方式':'13810008888','微信号':'fixture_preserved_wechat'}],preview:true});assert.equal(result.repeated,1,'matching WeChat with a supplied phone retains the original customer');
assert.equal((await importForm(db,ceo,ceo,body)).skipped,7);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_assignments').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_notes').get().n,0);assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
const discarded=await importForm(db,ceo,ceo,{...body,rows:[{'客户名称':'No usable contact','邮箱':'email-only@example.invalid','分配业务员':'sales'}]});assert.equal(discarded.inserted,0);assert.equal(discarded.reviewed,0);assert.equal(discarded.skipped,1);assert.equal(discarded.previewRows[0].kind,'discard');assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_leads WHERE name='No usable contact'").get().n,0);assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_customer_pool WHERE payload LIKE '%No usable contact%'").get().n,0);
sql.prepare("INSERT INTO crm_customer_pool(id,source,raw,payload,state,created,updated,created_by) VALUES('discarded-legacy','抖音','{}','{\"name\":\"Discarded legacy\",\"market\":\"内贸\"}','放弃','2026-11-05','2026-11-05','ceo')").run();assert.equal((await customerPage(db,ceo,new URL('https://fixture.invalid/?q=Discarded'))).total,0);
// Account totals and pagination must include every pending row, beyond the old 300-row cap.
for(let i=0;i<305;i++)sql.prepare("INSERT INTO crm_customer_pool(id,source,raw,payload,created,updated,created_by) VALUES(?,'小红书',?,?,?,'2026-11-05','ceo')").run('large-pending-'+i,JSON.stringify({'接待抖音号':'工厂号'}),JSON.stringify({name:'Large pending '+i,market:'内贸',province:'江苏省',source_account:'工厂号'}),'2026-11-05');
page=await customerPage(db,ceo,new URL('https://fixture.invalid/?'+new URLSearchParams({market:'内贸',source:'小红书',source_account:'工厂号',q:'Large pending',page:'11'})));assert.equal(page.total,305);assert.equal(page.pages,11);assert.equal(page.rows.length,5);
const longContact='https://example.invalid/wechat/'+ 'x'.repeat(150);const longResult=await importForm(db,ceo,ceo,{...body,rows:[{'客户名称':'Long WeChat source','微信号':longContact,'分配业务员':'sales'}]});assert.equal(longResult.inserted,1);assert.equal(customerProfile(sql.prepare("SELECT * FROM crm_leads WHERE name='Long WeChat source'").get()).wechat,longContact);
console.log('PASS: province/city, separate phone and WeChat, both platforms and three accounts, account/region/WeChat search, A/B/C/D/F import with raw progress, either WeChat or phone at create/import/profile save, review retention, safe WeChat dedup and no reallocation.');
