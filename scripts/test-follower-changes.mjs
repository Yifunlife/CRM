import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/operations.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {deriveFollowerChanges,followerChangeText,summarizeOperations}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const row=(id,date,total,account='a',status='有效')=>({id,date,followers_total:total,account_id:account,status,posts:0,ad_spend:0,other_spend:0,revenue:0});
let input=[row('3','2026-10-12',1025),row('1','2026-10-10',1000),row('other','2026-10-11',5000,'b')];
let rows=deriveFollowerChanges(input),r=rows.find(r=>r.id==='3');
assert.equal(r.followers_change,null);assert.equal(r.interval_change,25);assert.equal(r.previous_date,'2026-10-10');assert.equal(r.gap_days,2);assert.match(followerChangeText(r),/间隔 2 天/);
assert.equal(rows.find(r=>r.id==='1').followers_change,null);assert.equal(rows.find(r=>r.id==='other').interval_change,null);
input.push(row('2','2026-10-11',1010));rows=deriveFollowerChanges(input);assert.equal(rows.find(r=>r.id==='2').followers_change,10);assert.equal(rows.find(r=>r.id==='3').followers_change,15);
input.find(r=>r.id==='2').followers_total=1030;rows=deriveFollowerChanges(input);assert.equal(rows.find(r=>r.id==='3').followers_change,-5);
input.find(r=>r.id==='2').status='作废';rows=deriveFollowerChanges(input);assert.equal(rows.find(r=>r.id==='2').followers_change,null);assert.equal(rows.find(r=>r.id==='3').followers_change,null);assert.equal(rows.find(r=>r.id==='3').interval_change,25);
input.find(r=>r.id==='2').status='有效';assert.equal(deriveFollowerChanges(input).find(r=>r.id==='3').followers_change,-5);
for(const [before,after] of [['2026-09-30','2026-10-01'],['2026-12-31','2027-01-01'],['2028-02-29','2028-03-01']]){const d=deriveFollowerChanges([row('x',before,0),row('y',after,0)]);assert.equal(d[1].followers_change,0);}
const monthRows=[row('base','2026-09-30',900),...input],summary=summarizeOperations([{id:'a'}],monthRows,'2026-10','2026-10-12');assert.equal(summary[0].gained,125);assert.equal(summary[0].today_gained,-5);
assert.equal(summarizeOperations([{id:'a'}],input,'2026-10')[0].gained,null,'missing month baseline must not be treated as zero');
assert.equal(input[0].followers_change,undefined,'read-time derivation must not mutate source totals');
console.log('PASS: first entry, consecutive totals, decline, missing dates, out-of-order backfill, correction, void/restore, accounts, month/year/leap boundaries and monthly baseline');
