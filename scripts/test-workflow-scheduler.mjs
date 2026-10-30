import assert from 'node:assert/strict';
import {build} from 'esbuild';
const jobs={
 'followup-notifications':'refreshFollowupNotifications',
 'customer-pool':'processCustomerPool',
 'google-form-sync':'syncGoogleForms',
 'sales-suite-server':'refreshSalesSuite',
 'quote-bridge':'refreshQuoteBridge'
};
const bundle=await build({entryPoints:['lib/workflow-scheduler.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'job-fixtures',setup(b){b.onResolve({filter:/^\.\//},a=>jobs[a.path.slice(2)]?{path:a.path.slice(2),namespace:'jobs'}:undefined);b.onLoad({filter:/.*/,namespace:'jobs'},a=>({contents:`export async function ${jobs[a.path]}(...args){globalThis.__calls.push({job:${JSON.stringify(a.path)},args});if(globalThis.__fail===${JSON.stringify(a.path)})throw globalThis.__failure;}`}));}}]});
const {runScheduledWorkflow}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const log=console.log,events=[];console.log=s=>events.push(JSON.parse(s));
globalThis.__calls=[];globalThis.__failure=new Error('private provider payload');
const db={},source={},env={DB:db,QUOTE_DB:source};
try{
 await runScheduledWorkflow(Date.parse('2026-11-02T00:00:00Z'),env);
 assert.deepEqual(globalThis.__calls.map(c=>c.job),Object.keys(jobs));
 assert(globalThis.__calls.every(c=>c.args[0]===db));assert.deepEqual(globalThis.__calls[3].args,[db,source,undefined,true]);
 assert.deepEqual(globalThis.__calls[4].args,[db,source]);assert.equal(new Set(events.map(e=>e.run_id)).size,1);assert(events.every(e=>e.outcome==='completed'));
 globalThis.__calls=[];await runScheduledWorkflow(Date.parse('2026-11-02T00:05:00Z'),env);assert.equal(globalThis.__calls[3].args[3],false);
 globalThis.__calls=[];await runScheduledWorkflow(0,{CRM_BACKEND_ORIGIN:'https://backend.test'});assert.equal(globalThis.__calls.length,0);
 await assert.rejects(runScheduledWorkflow(0,{}),/database binding/);assert.equal(globalThis.__calls.length,0);
 globalThis.__fail='google-form-sync';await assert.rejects(runScheduledWorkflow(0,env),e=>e===globalThis.__failure);
 assert.deepEqual(globalThis.__calls.map(c=>c.job),Object.keys(jobs).slice(0,3));assert.equal(events.at(-1).outcome,'failed');assert.equal(events.at(-1).module,'google');assert(!JSON.stringify(events).includes('private provider payload'));
 globalThis.__fail=undefined;globalThis.__calls=[];console.log=()=>{throw Error('log sink down');};await runScheduledWorkflow(0,env);assert.equal(globalThis.__calls.length,5);
}finally{console.log=log;delete globalThis.__calls;delete globalThis.__fail;delete globalThis.__failure;}
console.log('PASS: scheduled job order, database bindings, Beijing 08:00 condition, proxy exclusion, stop on failure, run correlation and log failure isolation.');
