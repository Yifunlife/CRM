import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
const jobs={'followup-notifications':'refreshFollowupNotifications','google-form-sync':'syncGoogleForms','sales-suite-server':'refreshSalesSuite'};
const bundle=await build({entryPoints:['lib/workflow-scheduler.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'job-fixtures',setup(b){b.onResolve({filter:/^\.\//},a=>jobs[a.path.slice(2)]?{path:a.path.slice(2),namespace:'jobs'}:undefined);b.onLoad({filter:/.*/,namespace:'jobs'},a=>({contents:`export async function ${jobs[a.path]}(...args){globalThis.__calls.push({job:${JSON.stringify(a.path)},args});if(globalThis.__fail===${JSON.stringify(a.path)})throw globalThis.__failure;}`}));}}]});
const {runScheduledWorkflow}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const log=console.log,events=[];console.log=s=>events.push(JSON.parse(s));
globalThis.__calls=[];globalThis.__failure=new Error('private provider payload');
const db={},env={DB:db,QUOTE_DB:{}};
const run=async at=>{globalThis.__calls=[];await runScheduledWorkflow(Date.parse(at),env);return globalThis.__calls;};
try{
 const at='2026-11-02T00:00:00.000Z',calls=await run(at);
 assert.deepEqual(calls.map(c=>c.job),['followup-notifications','sales-suite-server']);
 assert.deepEqual(calls[0].args,[db,at]);assert.deepEqual(calls[1].args,[db,undefined,at,true]);
 assert.equal(new Set(events.map(e=>e.run_id)).size,1);
 for(const at of ['2026-11-02T00:05:00Z','2026-11-02T03:00:00Z','2026-11-02T22:00:00Z','2026-06-02T21:00:00Z'])assert.equal((await run(at)).length,0,at);
 for(const at of ['2026-11-02T21:00:00.000Z','2026-06-02T22:00:00.000Z']){const c=await run(at);assert.deepEqual(c,[{job:'google-form-sync',args:[db,{at}]}]);}
 globalThis.__calls=[];await runScheduledWorkflow(0,{CRM_BACKEND_ORIGIN:'https://backend.test'});assert.equal(globalThis.__calls.length,0);
 await assert.rejects(runScheduledWorkflow(0,{}),/database binding/);
 globalThis.__fail='followup-notifications';await assert.rejects(run(at),e=>e===globalThis.__failure);
 assert.deepEqual(globalThis.__calls.map(c=>c.job),['followup-notifications','sales-suite-server'],'one reminder family cannot block the other');
 assert(events.some(e=>e.outcome==='failed'));assert(!JSON.stringify(events).includes('private provider payload'));
 globalThis.__fail=undefined;console.log=()=>{throw Error('log sink down');};await run(at);
 assert.deepEqual(JSON.parse(readFileSync('wrangler.json')).triggers.crons,['0 0 * * *','0 21,22 * * *']);
}finally{console.log=log;delete globalThis.__calls;delete globalThis.__fail;delete globalThis.__failure;}
console.log('PASS: Beijing daily reminders, Sydney DST intake, no five-minute work or quote/pool sweep, independent failure and safe diagnostics.');
