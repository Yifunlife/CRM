import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleURL,database} from './test-form-intake.mjs';

const {customerOrigin}=await import(moduleURL('lib/customer-origin.ts'));
const {customerPage}=await import(moduleURL('lib/customer-page.ts'));
const origin=(detail={},raw={},extra={})=>customerOrigin({source:'Meta',detail,...extra},raw);
assert.equal(origin({form_name:'玩具号客资-增加公司名'}).origin_account,'玩具号');
assert.equal(origin({'来源表单':'【全案客资】多个单选-含国家'}).origin_account,'待确认');
for(const account of ['乐园号','玩具号','工厂号'])assert.equal(origin({'来源账号':account}).origin_account,account);
assert.equal(origin({'来源账号':'乐园号'},{source_account:'工厂号'}).origin_account,'待确认');
assert.equal(origin({ad_name:'工厂号客户需求：全案'},{},{business_scope:'meta-product'}).origin_account,'待确认');
assert.equal(origin({}, {}, {source:'WhatsApp／其他'}).origin_account,'—');
assert.equal(origin({}, {platform:'ig'}).display_source,'Instagram');
assert.equal(origin({platform:'fb'}, {platform:'ig'}).display_source,'Meta（平台待确认）');
assert.equal(origin({}, '{not json').origin_account,'待确认');

const sql=new DatabaseSync(':memory:');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const db=database(sql),admin={id:'admin',role:'admin'},sales={id:'sales',role:'sales'};
for(const u of [admin,sales])sql.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-01-01');
for(const [id,owner,detail] of [['own','sales',{form_name:'【全案客资】多个单选-含国家'}],['other','admin',{source_account:'工厂号',source_category:'模拟区'}],['new-format','sales',{}]]){
 sql.prepare("INSERT INTO crm_leads(id,name,source,channel,owner_id,detail,fingerprint,created) VALUES(?,?,'Meta','fb',?,?,?,'2026-11-01')").run(id,id,owner,JSON.stringify(detail),id);
}
const submission=(id,lead,kind,occurred,raw)=>sql.prepare('INSERT INTO crm_form_submissions(id,lead_id,phone,email,occurred,raw,kind,created) VALUES(?,?,?,?,?,?,?,?)').run(id,lead,'','',occurred,JSON.stringify(raw),kind,occurred);
submission('repeat','own','repeat','2026-11-02',{form_name:'玩具号客资-增加公司名'});
submission('new-first','new-format','new','2026-11-01',{form_name:'玩具号客资-增加公司名',platform:'fb'});
submission('new-later','new-format','repeat','2026-11-02',{source_account:'工厂号',source_category:'模拟区'});
sql.prepare("INSERT INTO crm_customer_pool(id,source,raw,payload,created,updated,created_by,state) VALUES('pending','Meta',?,?,'2026-11-02','2026-11-02','admin','待确认')").run(JSON.stringify({form_name:'玩具号客资-增加公司名',platform:'ig'}),JSON.stringify({name:'Pending',country:'US'}));
const snapshot=()=>JSON.stringify(['crm_leads','crm_customer_pool','crm_form_submissions','crm_assignments'].map(t=>sql.prepare('SELECT * FROM '+t+' ORDER BY id').all()));
const before=snapshot(),read=(params={},u=admin)=>customerPage(db,u,new URL('http://test/?'+new URLSearchParams(params)));
const data=await read();assert.equal(data.total,4);assert(data.rows.every(r=>!('origin_category' in r)));
assert.equal(data.rows.find(r=>r.id==='new-format').origin_account,'玩具号');
assert.equal(data.rows.find(r=>r.id==='other').origin_account,'工厂号');
const pending=data.rows.find(r=>r.intake);assert.equal(pending.origin_account,'玩具号');assert.equal(pending.display_source,'Instagram');
const ig=await read({source:'Instagram'});assert.equal(ig.total,1);assert.equal(ig.rows[0].id,pending.id);assert.equal(ig.platform_sources.Instagram,1);
const own=await read({},sales);assert.equal(own.total,2);assert(own.rows.every(r=>!r.intake&&r.owner_id==='sales'));assert(!own.rows.some(r=>r.id==='other'));
assert.equal(snapshot(),before);
console.log('PASS: separate platform/account, original form recovery, pending raw source, exact platform filter, repeated enquiries do not replace first source, owner isolation, counts and zero writes.');
