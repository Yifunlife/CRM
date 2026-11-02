import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['app/personal-workspace.tsx'],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',plugins:[{name:'work-fixture',setup(b){
 b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='react'?`export const useEffect=fn=>globalThis.__workEffects.push(fn);export const useState=initial=>{const i=globalThis.__workIndex++;if(!(i in globalThis.__workStates))globalThis.__workStates[i]=typeof initial==='function'?initial():initial;return [globalThis.__workStates[i],value=>{globalThis.__workStates[i]=typeof value==='function'?value(globalThis.__workStates[i]):value;}];};`:'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment="fragment";'}));
 b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
}}],logLevel:'silent'});
const {PersonalWork}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const todo=(id,due,tags)=>({id,name:id,due,tags,reasons:tags.includes('unscheduled')?['尚未安排下次跟进']:tags.includes('inquiry')?['有新咨询待核对']:['按期跟进']});
const home={today:'2026-11-03',todos:[todo('needs-scheduling','',['unscheduled']),todo('new-inquiry','',['inquiry']),todo('due-today','2026-11-03',['today']),todo('future-work','2026-11-05',[])],tasks:[],handovers:[]};
globalThis.__workEffects=[];globalThis.__workStates=[];globalThis.__workIndex=0;
const props={api:async p=>p==='sales-home'?home:{newLeads:[],reminders:[],tasks:[]},openLead(){},openOrder(){},openProject(){},navigate(){}};
const cleanup=[];
try{
 PersonalWork(props);for(const effect of globalThis.__workEffects)cleanup.push(effect());await new Promise(resolve=>setImmediate(resolve));
 globalThis.__workIndex=0;const tree=PersonalWork(props),strings=[];
 function walk(node){if(typeof node==='string'||typeof node==='number')strings.push(String(node));else if(Array.isArray(node))node.forEach(walk);else if(node&&typeof node==='object')walk(node.props?.children);}
 walk(tree);const text=strings.join('|');
 assert(text.includes('needs-scheduling'),'An undated scheduling action returned by the work API must not disappear');
 assert(text.includes('new-inquiry'),'An undated new enquiry must remain actionable');
 assert(text.includes('due-today'));assert(!text.includes('future-work'),'Scheduled future work remains outside today');
 assert(!text.includes('今天暂无待办或临近时间提醒。'));
 assert(/已逾期\s*\|0/.test(text),'Undated work must not be labelled overdue');
 const sections=[];function collect(node){if(Array.isArray(node))node.forEach(collect);else if(node&&typeof node==='object'){if(node.type==='section'){const old=strings.length;walk(node);sections.push(strings.slice(old).join('|'));strings.length=old;}collect(node.props?.children);}}collect(tree);
 const dated=sections.find(s=>s.includes('今天待办')),unscheduled=sections.find(s=>s.includes('待安排事项'));
 assert(dated.includes('due-today')&&!dated.includes('needs-scheduling')&&!dated.includes('new-inquiry'));assert(unscheduled.includes('needs-scheduling')&&unscheduled.includes('new-inquiry'));
 assert(text.includes('不计入今日到期或逾期'));
 console.log('PASS: undated scheduling and new enquiries remain visible; due work stays visible; future work stays out; no invented overdue dates.');
}finally{cleanup.forEach(fn=>fn?.());for(const key of ['__workEffects','__workStates','__workIndex'])delete globalThis[key];}
