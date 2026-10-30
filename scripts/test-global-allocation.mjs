import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const module=(file,replacements={})=>{let source=readFileSync(file,'utf8');for(const [from,to] of Object.entries(replacements))source=source.replaceAll(from,JSON.stringify(to));return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');};
const allocation=module('lib/allocation.ts'),crm=module('lib/crm.ts'),{distribute,allocationEndpoint,allocationWeights}=await import(module('lib/allocation-server.ts',{"'./allocation'":allocation,"'./crm'":crm}));
const {BUSINESS_SCOPES,monthNow}=await import(allocation),sqlite=new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}async run(){return {meta:sqlite.prepare(this.sql).run(...this.args)};}}
const db={prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const result=statements.map(s=>({meta:sqlite.prepare(s.sql).run(...s.args)}));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
for(const [id,role] of [['admin','admin'],['a','sales'],['b','management'],['c','ceo'],['outside','ceo']])sqlite.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(id,id,id,role,'unused','2026-01-01');
const config={members:['a','b','c'].map(user_id=>({user_id,state:'参与',share:0})),rule:{performance:30,maxChange:10,minimum:5,automatic:true}};
const save=(scope,value=config)=>sqlite.prepare('INSERT INTO crm_allocation_configs(scope,payload,updated,updated_by) VALUES(?,?,?,?) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload').run(scope,JSON.stringify(value),'now','admin');
save('all');for(const s of BUSINESS_SCOPES)save(s.id);
const insert=(id,scope)=>{const s=BUSINESS_SCOPES.find(s=>s.id===scope);sqlite.prepare('INSERT INTO crm_leads(id,name,source,business_scope,detail,fingerprint,created) VALUES(?,?,?,?,?,?,?)').run(id,id,s.source,scope,'{}',id,new Date().toISOString());sqlite.prepare("UPDATE crm_leads SET cohort='new' WHERE id=?").run(id);};
const owner=id=>sqlite.prepare('SELECT owner_id FROM crm_leads WHERE id=?').get(id).owner_id;
for(const [i,scope] of ['google','meta-product','whatsapp'].entries()){insert('first-'+i,scope);await distribute(db,['first-'+i],scope,'admin');}
assert.deepEqual([0,1,2].map(i=>owner('first-'+i)),['a','b','c'],'Different channels must share one allocation counter');
// A stale per-channel roster must never override the common roster.
save('google',{...config,members:[{user_id:'outside',state:'参与',share:100}]});
assert.deepEqual((await allocationWeights(db,'google')).weights.map(w=>w.user_id),['a','b','c']);
const call=(path,body={},method='POST',query='')=>allocationEndpoint(db,{id:'admin',role:'admin'},path,method,body,new URL('https://test.invalid/api/'+path+query));
await assert.rejects(call('allocation/config',{scope:'google',config}),/全渠道|刷新/);
const ids=[];for(let i=0;i<30;i++){const id='mixed-'+i;insert(id,BUSINESS_SCOPES[i%BUSINESS_SCOPES.length].id);ids.push(id);}
assert.equal((await call('allocation/distribute',{ids})).assigned,30);
assert.deepEqual(sqlite.prepare('SELECT owner_id,COUNT(*) n FROM crm_assignments GROUP BY owner_id ORDER BY owner_id').all().map(r=>[r.owner_id,r.n]),[['a',11],['b',11],['c',11]]);
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id WHERE a.business_scope<>l.business_scope').get().n,0);
assert.equal(await distribute(db,ids,'all','admin'),0);
// Existing equal allocations from before the correction count across every channel.
sqlite.prepare("UPDATE crm_assignments SET policy='equal-v1' WHERE owner_id='a'").run();
insert('carry','google');await distribute(db,['carry'],'google','admin');assert.equal(owner('carry'),'a');
await call('allocation/config',{scope:'all',config:{...config,members:config.members.map(m=>m.user_id==='b'?{...m,state:'请假'}:m)}});
insert('leave','meta-full');await distribute(db,['leave'],'meta-full','admin');assert.equal(owner('leave'),'c');
sqlite.prepare("UPDATE crm_users SET active=0 WHERE id='c'").run();
assert.deepEqual((await allocationWeights(db,'whatsapp')).weights.map(w=>w.user_id),['a']);
const report=await call('allocation/report',{},'GET','?scope=all&month='+monthNow());
assert.equal(report.assigned.reduce((n,r)=>n+r.n,0),35);assert.equal(report.globalAssigned.reduce((n,r)=>n+r.n,0),35);
assert.equal(report.config_scope,'all');assert.equal(report.policy,'equal-global-v1');
assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
console.log('PASS: shared cross-channel counter and roster, 33 customers split 11/11/11, mixed-source batches, original source preservation, idempotence, carry-forward counts, leave/disabled accounts, stale settings rejection and global reporting.');
