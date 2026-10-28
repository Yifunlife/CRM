import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const moduleUrl=(file,replacements={})=>{let source=readFileSync(file,'utf8');for(const [from,to] of Object.entries(replacements))source=source.replace(from,to);return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');};
const allocationUrl=moduleUrl('lib/allocation.ts'),crmUrl=moduleUrl('lib/crm.ts');
const a=await import(allocationUrl),server=await import(moduleUrl('lib/allocation-server.ts',{"'./allocation'":JSON.stringify(allocationUrl),"'./crm'":JSON.stringify(crmUrl)}));
const config={members:[{user_id:'a',state:'参与',share:50},{user_id:'b',state:'参与',share:50},{user_id:'c',state:'请假',share:0}],rule:{performance:30,maxChange:10,minimum:5,automatic:false,receipts:false}};
const users=[{id:'a',role:'sales',active:1},{id:'b',role:'sales',active:1},{id:'c',role:'sales',active:1}];
a.validateConfig(config,users);
const leaveConfig={...config,members:config.members.map(m=>({...m,state:m.user_id==='b'?'请假':m.state}))};
a.validateConfig(leaveConfig,users);
assert.deepEqual(a.effectiveShares(leaveConfig,null,['a','b','c']),[{user_id:'a',share:100}]);
assert.deepEqual(a.suggest(leaveConfig.members,{a:100},{a:1,b:100},config.rule).map(p=>[p.user_id,p.share,p.deals]),[['a',100,1]]);
assert.deepEqual(a.effectiveShares(config,null,['a','b','c']).map(p=>p.share),[50,50]);
assert.deepEqual(leaveConfig.members.map(m=>m.share),[50,50,0]);
assert.deepEqual(a.suggest(config.members,{a:50,b:50},{a:8,b:2},config.rule).map(p=>p.share),[59,41]);
assert.deepEqual(a.suggest(config.members,{a:59,b:41},{},config.rule).map(p=>p.share),[59,41]);
assert.deepEqual(a.suggest(config.members,{a:50,b:50},{a:100,b:0},config.rule).map(p=>p.share),[60,40]);
assert.doesNotThrow(()=>a.validateConfig({...config,members:[config.members[0]]},users),'legacy percentages no longer constrain equal allocation');
assert.throws(()=>a.validateConfig({...config,members:[...config.members,config.members[0]]},users),/重复/);
assert.throws(()=>a.validateConfig(config,[{...users[0],active:0},users[1],users[2]]),/停用/);
assert.equal(a.nextMonth('2026-12'),'2027-01');
assert.equal(a.monthNow(new Date('2026-09-30T15:00:00Z')),'2026-10');
assert.deepEqual(a.effectiveShares(config,{shares:[{user_id:'a',share:60},{user_id:'b',share:40}]},['a']),[{user_id:'a',share:100}]);
for(let i=0;i<200;i++){const count=2+i%9,share=100/count,members=Array.from({length:count},(_,n)=>({user_id:String(n),state:'参与',share})),out=a.suggest(members,Object.fromEntries(members.map(m=>[m.user_id,share])),Object.fromEntries(members.map((m,n)=>[m.user_id,(i*7+n*11)%23])),config.rule);assert.equal(Math.round(out.reduce((n,p)=>n+p.share,0)*100),10000);assert.ok(out.every(p=>p.share>=5&&Math.abs(p.share-share)<=10.001));}
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}async run(){return {meta:sqlite.prepare(this.sql).run(...this.args)};}}
const db={prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
for(const [id,role] of [['admin','admin'],['a','sales'],['b','sales'],['c','sales']])sqlite.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(id,id,id,role,'unused','2026-01-01');
const admin={id:'admin',role:'admin'},scope='meta-full',url=new URL('https://test.invalid/api/allocation/config');
const endpoint=(path,method='POST',body={},role=admin,query='')=>server.allocationEndpoint(db,role,path,method,body,new URL(url.origin+'/api/'+path+query));
await assert.rejects(endpoint('allocation/config','POST',{scope,config},{id:'a',role:'sales'}),/权限/);
await assert.rejects(endpoint('allocation/config','POST',{scope,config},{id:'admin',role:'operations'}),/管理员/);
await endpoint('allocation/config','POST',{scope,config});
const insert=sqlite.prepare("INSERT INTO crm_leads(id,name,source,business_scope,detail,fingerprint,created,owner_id,original_owner,review) VALUES(?,?,'Meta',?,'{}',?,'2026-10-01',?,?,?)");
for(let i=0;i<100;i++)insert.run('lead'+i,'客户'+i,scope,'fp'+i,null,'',0);
insert.run('existing','已有客户',scope,'old','c','',0);insert.run('review','重复待核查',scope,'review',null,'',1);insert.run('original','原负责人',scope,'original',null,'历史业务员',0);insert.run('other','其他范围','meta-product','other',null,'',0);
const ids=Array.from({length:100},(_,i)=>'lead'+i);
await assert.rejects(endpoint('allocation/distribute','POST',{scope,ids:['other']}),/同一业务范围/);
assert.equal((await endpoint('allocation/distribute','POST',{scope,ids})).assigned,100);
assert.deepEqual(sqlite.prepare('SELECT owner_id,COUNT(*) n FROM crm_leads WHERE id LIKE ? GROUP BY owner_id ORDER BY owner_id').all('lead%').map(r=>[r.owner_id,r.n]),[['a',50],['b',50]]);
assert.equal(sqlite.prepare("SELECT owner_id FROM crm_leads WHERE id='existing'").get().owner_id,'c');
assert.equal(sqlite.prepare("SELECT owner_id FROM crm_leads WHERE id='review'").get().owner_id,null);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM crm_assignments").get().n,100);
assert.equal(await server.distribute(db,ids,scope,'admin'),0);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM crm_assignments").get().n,100);
const current=a.monthNow(),[y,m]=current.split('-').map(Number),previous=`${m===1?y-1:y}-${String(m===1?12:m-1).padStart(2,'0')}`;
const deal=sqlite.prepare('INSERT INTO crm_deals(id,order_number,lead_id,owner_id,business_scope,deal_date,created,created_by,cancelled) VALUES(?,?,?,?,?,?,?,?,?)');
const owner=sqlite.prepare("SELECT owner_id FROM crm_leads WHERE id='lead0'").get().owner_id;
deal.run('d1','o1','lead0',owner,scope,previous+'-05','now','admin',0);deal.run('d2','o2','lead0',owner,scope,previous+'-06','now','admin',0);deal.run('d3','o3','lead0',owner,scope,previous+'-07','now','admin',1);deal.run('d4','o4','other','a','meta-product',previous+'-05','now','admin',0);
const report=await endpoint('allocation/report','GET',{},admin,`?scope=${scope}&month=${previous}`);
assert.equal(report.deals.reduce((n,r)=>n+r.n,0),2);assert.equal(report.conversion.find(r=>r.owner_id===owner).assigned,50);assert.equal(report.conversion.find(r=>r.owner_id===owner).converted,1);
await assert.rejects(endpoint('allocation/confirm','POST',{scope,month:current,shares:[]}),/统一平均分配/);
const historical={shares:[{user_id:'a',share:90},{user_id:'b',share:10}],report:{users:[],deals:[]}};
sqlite.prepare('INSERT INTO crm_allocation_plans(key,scope,month,payload,confirmed,confirmed_by) VALUES(?,?,?,?,?,?)').run(scope+':'+current,scope,current,JSON.stringify(historical),'now','admin');
assert.deepEqual((await server.allocationWeights(db,scope)).weights.map(w=>w.share),[50,50]);
sqlite.prepare("UPDATE crm_deals SET cancelled=1").run();assert.equal((await server.allocationWeights(db,scope)).weights.find(w=>w.user_id===owner).share,50);
assert.equal(sqlite.prepare('SELECT payload FROM crm_allocation_plans WHERE key=?').get(scope+':'+current).payload,JSON.stringify(historical));
sqlite.prepare("UPDATE crm_users SET active=0 WHERE id=?").run(owner);const remaining=(await server.allocationWeights(db,scope)).weights;assert.equal(remaining.length,1);assert.equal(remaining[0].share,100);
assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
console.log('PASS: monthly formula, zero deals, change limits, minimum, rounding, roles, scoped distribution, paused/disabled users, duplicate allocation, existing ownership, order counting, cohort conversion, equal allocation and preserved historical plans.');

const trio=['a','b','c'].map(user_id=>({user_id,state:'参与',share:0}));
const cash=(cny=0,usd=0)=>({cny,usd});
assert.deepEqual(a.receiptShares(trio,{}, {b:cash(5_000_000),c:cash(0,1_000_000)}).map(r=>r.share),[26.67,36.67,36.66]);
assert.equal(a.receiptShares(trio,{}, {a:cash(4_999_999,999_999)})[0].qualified,false);
assert.equal(a.receiptShares(trio,{}, {a:cash(5_000_000)})[0].qualified,true);
assert.equal(a.receiptShares(trio,{}, {a:cash(0,1_000_000)})[0].qualified,true);
assert.deepEqual(a.receiptShares(trio,{a:1},{b:cash(5_000_000),c:cash(5_000_000)}).map(r=>r.share),[20,40,40]);
assert.equal(a.receiptShares(trio,{a:3},{a:cash(5_000_000),b:cash(5_000_000),c:cash(5_000_000)})[0].tier,2);
assert.deepEqual(a.receiptShares(trio,{a:5,b:5,c:5},{}).map(r=>r.share),[33.34,33.33,33.33]);
assert.equal(a.receiptShares(trio,{a:5},{b:cash(5_000_000),c:cash(5_000_000)})[0].share,0);
assert.equal(a.receiptShares(trio.map(m=>({...m,state:m.user_id==='a'?'请假':m.state})),{a:3},{a:cash(5_000_000)}).length,2);
a.validateConfig({members:trio.map(m=>({...m,state:'请假'})),rule:{...config.rule,receipts:true,automatic:true}},users);
const NativeDate=Date;
try{
 globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-05T04:00:00Z']));}static now(){return new NativeDate('2026-11-05T04:00:00Z').getTime();}};
 const scope2='douyin-local';sqlite.prepare('UPDATE crm_users SET active=1').run();
 await endpoint('allocation/config','POST',{scope:scope2,config:{members:trio,rule:{...config.rule,receipts:true}}});
 for(const uid of ['a','b','c']){insert.run('cash-'+uid,'收款测试'+uid,scope2,'cash-'+uid,uid,'',0);deal.run('cash-order-'+uid,'cash-no-'+uid,'cash-'+uid,uid,scope2,'2026-09-05','now','admin',0);}
 const receipt=sqlite.prepare('INSERT INTO crm_receipts(id,reference,deal_id,amount_minor,currency,received_date,created,created_by,cancelled) VALUES(?,?,?,?,?,?,?,?,?)');
 receipt.run('r1','ref1','cash-order-b',2_000_000,'CNY','2026-10-01','now','admin',0);
 receipt.run('r2','ref2','cash-order-b',3_000_000,'CNY','2026-10-15','now','admin',0);
 receipt.run('r3','ref3','cash-order-c',1_000_000,'USD','2026-10-15','now','admin',0);
 receipt.run('r4','ref4','cash-order-a',9_000_000,'CNY','2026-10-15','now','admin',1);
 receipt.run('r5','ref5','cash-order-a',9_000_000,'CNY','2026-11-01','now','admin',0);
 const r=await endpoint('allocation/report','GET',{},admin,'?scope='+scope2+'&month=2026-10');
 assert.equal(r.deals.length,0);assert.equal(r.cash.find(v=>v.owner_id==='b').cny,5_000_000);assert.equal(r.cash.find(v=>v.owner_id==='b').paid_orders,1);
 assert.deepEqual(r.proposal.map(p=>p.share),[100/3,100/3,100/3]);
 await assert.rejects(endpoint('allocation/confirm','POST',{scope:scope2,month:'2026-10',shares:[]}),/统一平均分配/);
 sqlite.prepare("UPDATE crm_receipts SET cancelled=1 WHERE id='r1'").run();
 assert.deepEqual((await server.allocationWeights(db,scope2)).weights.map(p=>p.share),[100/3,100/3,100/3]);
 assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
}finally{globalThis.Date=NativeDate;}
console.log('PASS: receipt currency thresholds, no currency mixing, partial payments and distinct orders, cash month vs deal month, cancelled receipts, legacy formula compatibility and receipts no longer changing allocation.');

// Leadership who sell participate only after being added to this business scope.
for(const [uid,role] of [['manager','management'],['manager-outside','management'],['chief','ceo'],['chief-outside','ceo']])sqlite.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(uid,uid,uid,role,'unused','2026-01-01');
for(const [participant,role] of [['manager','management'],['chief','ceo']]){
const managerScope='meta-product',managerConfig={members:[{user_id:'a',state:'参与',share:50},{user_id:participant,state:'参与',share:50}],rule:{...config.rule,receipts:true}};
const managerUsers=[...users,{id:'manager',role:'management',active:1},{id:'chief',role:'ceo',active:1}];
a.validateConfig({...managerConfig,rule:{...config.rule,receipts:false}},managerUsers);
await endpoint('allocation/config','POST',{scope:managerScope,config:managerConfig});
const managerReport=await endpoint('allocation/report','GET',{},admin,'?scope='+managerScope);
const expectedManagerShares=[{user_id:'a',share:50},{user_id:participant,share:50}];
assert.deepEqual(managerReport.liveCurrent,expectedManagerShares);
assert.deepEqual(managerReport.current,expectedManagerShares);
assert.deepEqual(managerReport.proposal.map(({user_id,share})=>({user_id,share})),expectedManagerShares);
assert.deepEqual((await server.allocationWeights(db,managerScope)).weights,expectedManagerShares);
for(let i=0;i<4;i++)insert.run(participant+'-lead-'+i,'管理层分配测试'+i,managerScope,participant+'-fp-'+i,null,'',0);
assert.equal((await endpoint('allocation/distribute','POST',{scope:managerScope,ids:Array.from({length:4},(_,i)=>participant+'-lead-'+i)})).assigned,4);
assert.deepEqual(sqlite.prepare("SELECT owner_id,COUNT(*) n FROM crm_leads WHERE id LIKE ? GROUP BY owner_id ORDER BY owner_id").all(participant+'-lead-%').map(r=>[r.owner_id,r.n]),[['a',2],[participant,2]]);
for(const state of ['请假','暂停']){
 await endpoint('allocation/config','POST',{scope:managerScope,config:{...managerConfig,members:managerConfig.members.map(m=>m.user_id===participant?{...m,state}:m)}});
 assert.deepEqual((await server.allocationWeights(db,managerScope)).weights,[{user_id:'a',share:100}]);
}
await endpoint('allocation/config','POST',{scope:managerScope,config:managerConfig});
sqlite.prepare("UPDATE crm_users SET active=0 WHERE id=?").run(participant);
assert.deepEqual((await server.allocationWeights(db,managerScope)).weights,[{user_id:'a',share:100}]);
assert.equal(sqlite.prepare("SELECT role FROM crm_users WHERE id=?").get(participant).role,role);
assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
console.log('PASS: '+role+' participates in scoped allocation and monthly shares, retains its role, and respects leave, pause, disabled accounts and scope membership.');
sqlite.prepare('DELETE FROM crm_assignments WHERE lead_id LIKE ?').run(participant+'-lead-%');
}
