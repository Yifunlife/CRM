import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['app/sales-overview.tsx'],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',plugins:[{name:'overview-fixture',setup(b){
 b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='react'?`export const useEffect=fn=>globalThis.__overviewEffects.push(fn);export const useState=initial=>{const i=globalThis.__overviewIndex++;if(!(i in globalThis.__overviewStates))globalThis.__overviewStates[i]=typeof initial==='function'?initial():initial;return [globalThis.__overviewStates[i],v=>{globalThis.__overviewStates[i]=typeof v==='function'?v(globalThis.__overviewStates[i]):v;}];};`:'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment="fragment";'}));
 b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
 b.onLoad({filter:/\/(status-badge|sales-dashboard-details)\.tsx$/},()=>({contents:'export default ()=>null;export const SalesMetricDetails=()=>null;',loader:'tsx'}));
}}],logLevel:'silent'});
const {default:Overview}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const report={summary:{total_customers:0,customers:0,total_grades:{},quoted:{},won:{}},people:[],all_customers:[],deals:[],projects:[],orders:[],quotes:[]};
for(const scopes of [['domestic'],['foreign'],['domestic','foreign'],[]]){
 globalThis.__overviewEffects=[];globalThis.__overviewStates=[];globalThis.__overviewIndex=0;
 const calls=[],allowed=scopes.map(s=>s==='domestic'?'内贸':'外贸'),user={id:'scoped-manager',role:'management',trade_scopes:scopes};
 const api=async path=>{calls.push(path);if(path.startsWith('role-workspace/report')){const market=new URL('https://test.invalid/?'+path.split('?')[1]).searchParams.get('market');assert(allowed.includes(market)||market==='全部'&&allowed.length===2,'The page requested a forbidden market');return report;}return {rows:[],items:[]};};
 const props={user,api,openLead(){},openOrder(){},openProject(){}};
 Overview(props);for(const effect of globalThis.__overviewEffects)effect();await new Promise(resolve=>setImmediate(resolve));
 if(!scopes.length){assert.match(globalThis.__overviewStates[2],/范围/);assert.equal(calls.length,0);continue;}
 assert.equal(globalThis.__overviewStates[2],'');assert(globalThis.__overviewStates[1]);
 globalThis.__overviewIndex=0;assert.doesNotThrow(()=>Overview(props),'A single authorized market must render without reading the absent report');
}
for(const key of ['__overviewEffects','__overviewStates','__overviewIndex'])delete globalThis[key];
console.log('PASS: domestic-only, foreign-only, dual-market and unconfigured management; unauthorized APIs never requested and authorized reports render.');
