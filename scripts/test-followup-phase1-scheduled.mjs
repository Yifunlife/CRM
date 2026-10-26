import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
// Exercise the built scheduled export directly: the local assets proxy has no scheduled handler.
const root=resolve('dist/server'),files=readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.js'));
files.splice(files.indexOf('index.js'),1);files.unshift('index.js');
const mf=new Miniflare({name:'phase1-scheduled-test',modules:files.map(f=>({type:'ESModule',path:resolve(root,f)})),modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'59e890b8-985a-4027-a205-50d8920509cb'},d1Persist:'work/followup-phase1-state/v3/d1'});
try{const worker=await mf.getWorker();assert.equal((await worker.scheduled({cron:'*/5 * * * *'})).outcome,'ok');console.log('PASS: built Worker scheduled handler executes with local D1 and without an open CRM page.');}finally{await mf.dispose();}
