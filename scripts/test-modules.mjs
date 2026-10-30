import {spawn} from 'node:child_process';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['lib/api/operations.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {MODULES}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const names=[...new Set(['module-boundaries','module-diagnostics','workflow-scheduler','api-module-contracts',...Object.values(MODULES).flatMap(m=>m.tests)])];
let failed=0;
for(const name of names){
 const result=await new Promise(resolve=>{
  const p=spawn(process.execPath,[`scripts/test-${name}.mjs`],{stdio:['ignore','pipe','pipe']});let output='';
  p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>output+=d);
  p.on('error',e=>resolve({code:1,output:e.message}));p.on('close',code=>resolve({code,output}));
 });
 console.log(`${result.code===0?'PASS':'FAIL'} ${name}`);
 if(result.code!==0){failed++;console.error(result.output);}
}
console.log(`${names.length-failed}/${names.length} module acceptance suites passed.`);
if(failed)process.exitCode=1;
