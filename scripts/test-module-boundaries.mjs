import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,join,normalize} from 'node:path';
import ts from 'typescript';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['lib/api/operations.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {MODULES}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
for(const [name,module] of Object.entries(MODULES)){
 assert(existsSync(module.entry),`${name}: missing module entry`);
 for(const test of module.tests)assert(existsSync(`scripts/test-${test}.mjs`),`${name}: missing acceptance test ${test}`);
}
const files=['lib/confirmed-workflow.ts','lib/execution-quote-source.ts','lib/workflow-scheduler.ts',...['lib/api','lib/confirmation'].flatMap(dir=>readdirSync(dir).filter(f=>f.endsWith('.ts')).map(f=>join(dir,f)))];
const imports=file=>{
 const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 return ast.statements.filter(s=>(ts.isImportDeclaration(s)||ts.isExportDeclaration(s))&&s.moduleSpecifier).map(s=>s.moduleSpecifier.text).filter(p=>p.startsWith('.')).map(p=>normalize(join(dirname(file),p.endsWith('.ts')?p:p+'.ts')));
};
const graph=new Map(files.map(f=>[f,imports(f)])),visiting=new Set(),visited=new Set();
function visit(file){assert(!visiting.has(file),`Circular module dependency: ${file}`);if(visited.has(file)||!graph.has(file))return;visiting.add(file);graph.get(file).forEach(visit);visiting.delete(file);visited.add(file);}
files.forEach(visit);
const steps=new Set(['quotes','contract','documents','release'].map(f=>`lib/confirmation/${f}.ts`));
for(const root of ['lib','app'])for(const path of readdirSync(root,{recursive:true}).filter(p=>/\.tsx?$/.test(p))){
 const file=join(root,path);
 if(file!=='lib/confirmed-workflow.ts')assert(!imports(file).some(f=>steps.has(f)),`${file}: call confirmation steps through confirmedWorkflow`);
}
for(const step of steps){
 assert(!graph.get(step).some(f=>steps.has(f)||f==='lib/order-execution-server.ts'),`${step}: confirmation steps must communicate through their facade/data contracts`);
}
assert(!graph.get('lib/execution-quote-source.ts').some(f=>steps.has(f)||f==='lib/order-execution-server.ts'),'Read-only quote source cannot depend on execution or confirmations');
for(const file of ['lib/api/business.ts','lib/confirmed-workflow.ts','lib/workflow-scheduler.ts'])assert(!/\.prepare\s*\(|\b(?:INSERT INTO|UPDATE crm_|DELETE FROM)\b/.test(readFileSync(file,'utf8')),`${file}: orchestration must not own business SQL`);
const schedulerImports=new Set(graph.get('lib/workflow-scheduler.ts'));
assert.deepEqual(schedulerImports,new Set(['lib/followup-notifications.ts','lib/google-form-sync.ts','lib/sales-suite-server.ts']),'Scheduler must not add a business confirmation without an explicit contract change');
const route=readFileSync('app/api/[...path]/route.ts','utf8');
assert(!/\b(?:INSERT(?: OR \w+)? INTO|UPDATE|DELETE FROM)\s+crm_(?:leads|deals|assignments|receipts|followup_orders)\b/.test(route),'HTTP entry must delegate business writes');
console.log('PASS: registered modules and acceptance tests, acyclic extracted modules, isolated confirmation steps, read-only quote dependency, SQL-free orchestration and bounded scheduler.');
