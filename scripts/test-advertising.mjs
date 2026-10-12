import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const moduleUrl=(file,replacements={})=>{let source=readFileSync(file,'utf8');for(const [from,to] of Object.entries(replacements))source=source.replaceAll(from,to);return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');};
const crm=moduleUrl('lib/crm.ts'),advertising=moduleUrl('lib/advertising.ts'),operations=moduleUrl('lib/operations.ts');
const errors='data:text/javascript,export class AllocationError extends Error {constructor(message,status=400){super(message);this.status=status;}}';
const {advertisingEndpoint}=await import(moduleUrl('lib/advertising-server.ts',{"'./operations'":JSON.stringify(operations),"'./crm'":JSON.stringify(crm),"'./advertising'":JSON.stringify(advertising),"'./allocation-server'":JSON.stringify(errors)}));
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}async run(){return {meta:sqlite.prepare(this.sql).run(...this.args)};}}
const db={prepare:sql=>new Statement(sql)},admin={id:'admin',role:'admin'},ops={id:'ops',role:'operations'},sales={id:'sales',role:'sales'};
for(const u of [admin,ops,sales])sqlite.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,u.id,u.role,'unused','2026-10-12');
const call=(user,method,body={})=>advertisingEndpoint(db,user,'advertising',method,body);
const draft={name:'测试投放',platform:'Meta',date:'2026-10-12',status:'计划中',owner_id:'ops',budget:'100.01',spent:'0.10',notes:'等待素材'};
await assert.rejects(call(sales,'GET'),e=>e.status===403);await assert.rejects(call(sales,'POST',draft),e=>e.status===403);
for(const platform of ['阿里','抖音本地推','Meta','谷歌'])await call(ops,'POST',{...draft,platform,currency:'FAKE'});
let rows=await call(admin,'GET');assert.equal(rows.length,4);for(const r of rows){assert.equal(r.currency,['阿里','抖音本地推'].includes(r.platform)?'CNY':'USD');assert.equal(r.budget,10001);assert.equal(r.spent,10);}
const meta=rows.find(r=>r.platform==='Meta');await call(ops,'PATCH',{...draft,id:meta.id,status:'投放中',spent:'30.25'});rows=await call(admin,'GET');assert.equal(rows.find(r=>r.id===meta.id).spent,3025);
await assert.rejects(call(admin,'PATCH',{...draft,id:meta.id,platform:'阿里'}),/币种/);
await assert.rejects(call(admin,'PATCH',{...draft,id:'missing'}),e=>e.status===404);
for(const budget of ['-1','NaN','','1.234','10000000000','Infinity'])await assert.rejects(call(ops,'POST',{...draft,budget}),/金额/);
for(const date of ['2026-02-30','2026-13-01','bad'])await assert.rejects(call(ops,'POST',{...draft,date}),/日期/);
await assert.rejects(call(ops,'POST',{...draft,owner_id:'sales'}),/负责人/);await assert.rejects(call(ops,'POST',{...draft,status:'未知'}),/进度/);
sqlite.prepare("UPDATE crm_users SET active=0 WHERE id='ops'").run();await assert.rejects(call(admin,'POST',draft),/负责人/);
assert.equal((await call(admin,'GET')).length,4);assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
console.log('PASS: platform currency mapping, cents precision, operations create/update, sales denied, invalid inputs rejected, persisted records and foreign keys');
