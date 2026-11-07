import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {retainStaticAssets} from './retain-static-assets.mjs';

const root=mkdtempSync(join(tmpdir(),'crm-static-retention-'));
const cache=join(root,'shared-cache'),a=join(root,'build-a'),b=join(root,'build-b'),c=join(root,'build-c'),now=Date.now();
function asset(build,path,body){const file=join(build,'_next/static',path);mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,body);}
try{
 asset(a,'chunks/old-a.js','import "./old-dependency.js";');
 asset(a,'chunks/old-dependency.js','export const value=1;');
 asset(a,'css/old-a.css','.old{}');
 writeFileSync(join(a,'.env'),'private fixture');
 assert.equal(retainStaticAssets(a,cache,now).current,3);
 asset(b,'chunks/new-b.js','export const value=2;');
 assert.equal(retainStaticAssets(b,cache,now+1000).retained,3);
 for(const path of ['chunks/old-a.js','chunks/old-dependency.js','css/old-a.css'])assert.equal(readFileSync(join(b,'_next/static',path),'utf8'),readFileSync(join(a,'_next/static',path),'utf8'));
 assert(!existsSync(join(cache,'.env')));
 asset(c,'chunks/new-c.js','export const value=3;');
 assert.equal(retainStaticAssets(c,cache,now+8*24*60*60*1000).retained,0);
 assert(existsSync(join(c,'_next/static/chunks/new-c.js')));
 assert(existsSync(join(a,'_next/static/chunks/old-a.js')),'pruning the cache cannot delete the original build');
 console.log('PASS: subsequent releases retain complete old JS/CSS dependency graphs across worktrees; private files are excluded; expired cache entries leave original builds intact.');
}finally{rmSync(root,{recursive:true,force:true});}
