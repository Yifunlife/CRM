import assert from 'node:assert/strict';
import {moduleURL} from './test-form-intake.mjs';
const {readDashboard}=await import(moduleURL('lib/dashboard-read.ts'));
let calls=0;const report={customers:12};assert.equal(await readDashboard(async()=>{calls++;return report},'report'),report);assert.equal(calls,1);
for(const status of [500,502,503,504]){calls=0;assert.equal(await readDashboard(async()=>{if(++calls===1)throw Object.assign(new Error('read failed'),{status});return report},'report'),report);assert.equal(calls,2);}
for(const status of [400,401,403,404,409,429,undefined]){calls=0;const error=Object.assign(new Error('keep original reason'),{status});await assert.rejects(readDashboard(async()=>{calls++;throw error},'report'),e=>e===error);assert.equal(calls,1);}
calls=0;const first=Object.assign(new Error('first reference'),{status:500}),last=Object.assign(new Error('last reference'),{status:500});await assert.rejects(readDashboard(async()=>{throw ++calls===1?first:last},'report'),e=>e===last);assert.equal(calls,2);
console.log('PASS dashboard read: successful result preserved, one retry for transient 5xx, no retry for permissions/validation/rate limits/unknown errors, persistent failure retains the final diagnostic.');
