import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {resolve} from 'node:path';

const react=import.meta.resolve('react');
const result=await build({entryPoints:['app/page-loader.tsx'],bundle:true,write:false,format:'esm',platform:'node',external:['react']});
const source=result.outputFiles[0].text.replaceAll('from "react"','from '+JSON.stringify(react));
const {pageLoader,preloadPages,lazyPage,isPageLoadError}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let calls=0,resolveLoad;
const module={default:()=>null},load=pageLoader(()=>{calls++;return new Promise(resolve=>{resolveLoad=resolve;});});
const a=load(),b=load();assert.equal(a,b);assert.equal(calls,1);resolveLoad(module);assert.equal(await a,module);assert.equal(await load(),module);assert.equal(calls,1);
let failures=0;
const retry=pageLoader(async()=>{if(++failures===1)throw Error('offline');return module;});
await assert.rejects(retry(),/offline/);assert.equal(await retry(),module);assert.equal(failures,2);
for(const message of ['Failed to fetch dynamically imported module: /old.js','Importing a module script failed.','error loading dynamically imported module','Loading chunk 12 failed.','Unable to preload CSS for /old.css'])assert(isPageLoadError(Error(message)));
assert(!isPageLoadError(Error('Cannot read properties of undefined')));
let background=0,mounts=0;
lazyPage(async()=>{background++;return {default:()=>{mounts++;return null;}};});
lazyPage(async()=>{throw Error('offline');});
const preloads=await preloadPages();assert.equal(background,1);assert.equal(mounts,0);assert(preloads.some(r=>r.status==='rejected'));
console.log('PASS: shared in-flight loads, successful module cache, retry after rejection, browser import errors, background preload failure isolation and no component mounts.');

if(process.argv.includes('--serve')){
 const fixture=`import React,{Suspense,useState} from 'react';import {createRoot} from 'react-dom/client';
 import PageBoundary from './app/page-boundary';import {lazyPage} from './app/page-loader';
 let attempts=0,broken=true,mounts=0;
 const Transient=lazyPage(async()=>{if(attempts++===0)throw Error('Importing a module script failed.');return {default:()=>{mounts++;return <h1>重试成功</h1>}};});
 const Missing=lazyPage(()=>import('/missing-page.js'));
 function Broken(){if(broken)throw Error('fixture render failure');return <h1>页面恢复成功</h1>;}
 function Healthy(){const [value,set]=useState('');return <><h1>正常页面</h1><input aria-label="未保存文字" value={value} onChange={e=>set(e.target.value)}/></>;}
 function App(){const [page,set]=useState('正常页面'),[same,update]=useState(0);return <><nav>{['正常页面','暂时断网','旧版文件','页面异常'].map(p=><button key={p} onClick={()=>set(p)}>{p}</button>)}</nav><button onClick={()=>{broken=false;update(same+1)}}>修复测试异常</button><output>第 {same} 次外围更新</output><PageBoundary resetKey={page} onError={()=>{}}><Suspense fallback={<p role="status">正在加载页面…</p>}>{page==='正常页面'?<Healthy/>:page==='暂时断网'?<Transient/>:page==='旧版文件'?<Missing/>:<Broken/>}</Suspense></PageBoundary></>;}
 createRoot(document.getElementById('root')).render(<App/>);`;
 const bundle=await build({stdin:{contents:fixture,resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',external:['/missing-page.js'],define:{'process.env.NODE_ENV':'"production"'}});
 const js=bundle.outputFiles[0].text;
 createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(js);}
  else if(req.url==='/missing-page.js'){res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not Found');}
  else {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>CRM 导航恢复验证</title><style>body{font:16px system-ui;margin:40px;color:#23364f}button{padding:10px 18px;margin:8px}section{border:1px solid #ccd5df;padding:24px;margin-top:24px}input{padding:10px}output{display:block}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>');}
 }).listen(5189,'127.0.0.1',()=>console.log('Browser fixture: http://127.0.0.1:5189'));
}
