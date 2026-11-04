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
// The company view starts with all visible owners and exposes independent project facts.
globalThis.__projectEffects=[];globalThis.__projectStates=[];globalThis.__projectIndex=0;
const props={user:{id:'manager',role:'management',trade_scopes:['domestic','foreign']},api:async()=>({orders:[],projects:[],people:[]}),openLead(){},openOrder(){},openProject(){}};
Projects(props);
assert.equal(globalThis.__projectStates[1],'');
globalThis.__projectStates[4]={orders:[],projects:[{project_id:'p',name:'真实项目',country:'中国香港',owner_id:'sales',stage:'design',details:{contract_no:'HT-001',qualification:{area_m2:{value:'500'},height_m:{value:'6.5'}}},next_action:'确认图纸',next_date:'2026-11-15'}],people:[{id:'sales',name:'业务员'}]};
globalThis.__projectIndex=0;
let tree=Projects(props);
assert.deepEqual(nodes(tree).filter(n=>n.type==='th').map(n=>n.props.children),['合同号','项目名','国家/地区','面积（㎡）','层高（米）','业务员 / 跟单','当前阶段','当前节点 / 下一步','计划交付时间','状态','操作']);
const text=v=>Array.isArray(v)?v.map(text).join(''):v&&typeof v==='object'?text(v.props?.children):v==null?'':String(v);
assert.match(text(tree),/HT-001/);assert.match(text(tree),/中国香港/);assert.match(text(tree),/500/);assert.match(text(tree),/6.5/);assert.match(text(tree),/确认图纸/);
globalThis.__projectStates[2]='HT-001';globalThis.__projectIndex=0;assert.equal(nodes(Projects(props)).filter(n=>n.type==='tr').length,2,'contract number is searchable');
globalThis.__projectStates[2]='no-match';globalThis.__projectIndex=0;assert.equal(nodes(Projects(props)).filter(n=>n.type==='tr').length,1);
for(const key of ['__projectEffects','__projectStates','__projectIndex'])delete globalThis[key];
console.log('PASS: project defaults and filters use authorized markets for personal/company, single/dual/unconfigured scopes; unauthorized requests never issued.');
