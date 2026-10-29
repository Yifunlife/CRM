import assert from 'node:assert/strict';
import ts from 'typescript';import {readFileSync} from 'node:fs';
const url=file=>{let source=readFileSync(file,'utf8');source=source.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${url('lib/'+p.slice(2)+'.ts')}'`);return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');};
const {countryDistribution}=await import(url('lib/country-distribution.ts'));
const rows=[['美国',10],['USA',5],['中国',8],['巴西',7],['澳洲',6],['法国',5],['南非',4],['新加坡',3],['英国',2],['德国',2],['日本',2],['加拿大',1],['印度',1],['国家未登记',9]].map(([country,customers])=>({country,customers}));
const d=countryDistribution(rows);assert.equal(d.top.length,10);assert.deepEqual(d.top[0],['美国',15]);assert.equal(d.counts['美洲'],23);assert.equal(d.unknown,9);assert.equal(Object.values(d.counts).reduce((a,b)=>a+b,0)+d.unknown,d.total);assert.equal(d.top.reduce((a,b)=>a+b[1],0)+d.other+9,d.total);assert.equal(countryDistribution([]).total,0);console.log('PASS country aliases, top10, Americas grouping, unknowns, total reconciliation and empty state');
