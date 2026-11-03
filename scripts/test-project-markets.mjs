import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['app/project-management.tsx'],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',logLevel:'silent',plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='react'?`export const useEffect=fn=>globalThis.__projectEffects.push(fn);export const useState=initial=>{const i=globalThis.__projectIndex++;if(!(i in globalThis.__projectStates))globalThis.__projectStates[i]=typeof initial==='function'?initial():initial;return [globalThis.__projectStates[i],v=>{globalThis.__projectStates[i]=typeof v==='function'?v(globalThis.__projectStates[i]):v;}];};`:'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment="fragment";'}));
 b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));b.onLoad({filter:/\/project-detail\.tsx$/},()=>({contents:'export default ()=>null;',loader:'tsx'}));
}}]});
const {default:Projects}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const nodes=v=>Array.isArray(v)?v.flatMap(nodes):v&&typeof v==='object'?[v,...nodes(v.props?.children)]:[];
for(const role of ['sales','management','ceo'])for(const scopes of [[],['domestic'],['foreign'],['domestic','foreign']]){
 globalThis.__projectEffects=[];globalThis.__projectStates=[];globalThis.__projectIndex=0;
 const allowed=role==='ceo'?['内贸','外贸']:scopes.map(s=>s==='domestic'?'内贸':'外贸'),calls=[];
 const props={user:{id:'fixture',role,trade_scopes:scopes},personal:role==='sales',initialMarket:'全部',api:async path=>{calls.push(path);if(path.startsWith('role-workspace')){const market=new URL('https://test/?'+path.split('?')[1]).searchParams.get('market');assert(allowed.includes(market)||market==='全部'&&allowed.length===2);return {orders:[],projects:[],people:[]};}return {priorities:[]};},openLead(){},openOrder(){},openProject(){}};
 let tree=Projects(props);for(const effect of globalThis.__projectEffects)effect();await new Promise(resolve=>setImmediate(resolve));
 if(!allowed.length){assert.equal(calls.length,0);assert.match(globalThis.__projectStates[5],/范围/);continue;}
 assert.equal(globalThis.__projectStates[5],'');globalThis.__projectIndex=0;tree=Projects(props);
 const label=nodes(tree).find(n=>n.type==='label'&&Array.isArray(n.props.children)&&n.props.children[0]==='业务范围'),select=nodes(label).find(n=>n.type==='select'),options=nodes(select).filter(n=>n.type==='option').map(n=>n.props.children);
 assert.deepEqual(options,[...(allowed.length===2?['全部']:[]),...allowed,...(role==='ceo'?['待确认']:[])]);
 assert.equal(select.props.value,allowed.length===2?'全部':allowed[0]);assert(calls.some(p=>p.startsWith('role-workspace')));
}
for(const key of ['__projectEffects','__projectStates','__projectIndex'])delete globalThis[key];
console.log('PASS: project defaults and filters use authorized markets for personal/company, single/dual/unconfigured scopes; unauthorized requests never issued.');
