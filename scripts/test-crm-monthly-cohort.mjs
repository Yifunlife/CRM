import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync,existsSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=process.env.CRM_ROOT||(existsSync(join(base,'package.json'))?base:resolve(base,'../../../crm-site'));
const require=createRequire(join(root,'package.json')),{build}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const dir=mkdtempSync(join(tmpdir(),'crm-monthly-'));
const fallback={name:'existing-lib',setup(b){b.onResolve({filter:/^\.\/(operations-dashboard|operations-report)$/},args=>({path:join(args.path==='./operations-report'?base:root,'lib',args.path.slice(2)+'.ts')}));}};
try{
 await build({entryPoints:[join(base,'lib/crm-monthly-cohort.ts'),join(base,'lib/report-acquired-day.ts'),join(base,'lib/operations-report.ts')],outdir:dir,entryNames:"[name]",bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},plugins:[fallback],logLevel:'silent'});
 const {crmMonthlyCohort,cohortMonthTotal,previousMonth}=await import('file://'+join(dir,'crm-monthly-cohort.mjs'));
 const {reportAcquiredDay:monthlyAcquiredDay}=await import('file://'+join(dir,'report-acquired-day.mjs'));
 const {operationsReport}=await import('file://'+join(dir,'operations-report.mjs'));
 const lead=(id,date,extra={})=>({id,name:id,created:date+'T00:00:00Z',entered:date,country:'Egypt',source:'Meta',...extra});
 const leads=[lead('a','2026-09-02'),lead('duplicate','2026-10-02'),lead('b','2026-10-01'),lead('c','2026-10-03',{source:'阿里',country:'China'}),lead('cn','2026-10-04',{country:'China'}),lead('future','2027-01-01')];
 const subjects=[{lead_id:'a',subject_id:'a'},{lead_id:'duplicate',subject_id:'a'}];
 const deals=[{id:'d1',lead_id:'a',deal_date:'2026-09-15'},{id:'d2',lead_id:'duplicate',deal_date:'2026-10-15'},{id:'d3',lead_id:'b',deal_date:'2026-10-20'},{id:'void',lead_id:'b',deal_date:'2026-10-20',cancelled:1},{id:'before',lead_id:'b',deal_date:'2026-09-20'},{id:'later',lead_id:'b',deal_date:'2026-11-20'}];
 const quality=[{lead_id:'a',state:'有效'},{lead_id:'b',state:'有效'},{lead_id:'cn',state:'无效'}];
 const args={leads,subjects,deals,campaigns:[],attrs:[],quality,summary:[],from:'',to:'',asOf:'2026-10-29',spendRecorded:[]};
 const report=operationsReport(args),contracts=[{deal_id:'d1',currency:'USD',total_minor:10000},{deal_id:'d2',currency:'CNY',total_minor:30000}];
 const data=crmMonthlyCohort({report,...args,contracts});
 const sep=cohortMonthTotal(data,'2026-09','外贸',''),oct=cohortMonthTotal(data,'2026-10','外贸','');
 assert.equal(sep.customers,1);assert.equal(sep.orders,2);assert.equal(sep.converted,1);assert.equal(sep.valid,1);assert.deepEqual(sep.money,{USD:10000,CNY:30000});
 assert.equal(oct.customers,2);assert.equal(oct.orders,1);assert.equal(oct.converted,1);assert.equal(oct.valid,1);assert.equal(oct.unchecked,1);assert.equal(oct.missingContracts,1);assert.deepEqual(oct.money,{});
 assert.equal(cohortMonthTotal(data,'2026-10','内贸','').customers,1);
 assert.equal(cohortMonthTotal(data,'2026-10','外贸','阿里').customers,1);
 assert.equal(cohortMonthTotal(data,'2026-10','外贸','Meta').customers,1);
 assert.equal(cohortMonthTotal(data,'2026-08','',''),null);assert.equal(cohortMonthTotal(data,'2026-11','',''),null);
 assert.equal(monthlyAcquiredDay('2026-09-30T18:39:27-05:00'),'2026-10-01');assert.equal(monthlyAcquiredDay('2026/10/2'),'2026-10-02');assert.equal(monthlyAcquiredDay('2026-02-30'),null);assert.equal(monthlyAcquiredDay('bad'),null);assert.equal(monthlyAcquiredDay('2026-02-30T12:00:00Z'),null);
 const dateReport=operationsReport({...args,leads:[lead('iso','2026-10-29',{entered:'2026-08-31T20:00:00-05:00'})],subjects:[],deals:[]});assert.equal(dateReport.customers[0].acquired,'2026-09-01');
 assert.equal(previousMonth('2026-01'),'2025-12');assert.equal(previousMonth('2026-10'),'2026-09');
 assert.equal(cohortMonthTotal({...data,firstMonth:'2026-08'},'2026-08','','').customers,0);
 assert.ok(!JSON.stringify(data).includes('duplicate'));assert.equal(data.rows.reduce((n,r)=>n+r.customers,0),4);
 await build({entryPoints:[join(base,'app/crm-monthly-cohort.tsx')],outfile:join(dir,'component.cjs'),bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],nodePaths:[join(root,'node_modules')],plugins:[fallback],logLevel:'silent'});
 // Keep React resolution on the repository's installed runtime.
 const componentText=readFileSync(join(dir,'component.cjs'),'utf8').replaceAll('require("react")',`require(${JSON.stringify(join(root,'node_modules/react'))})`).replaceAll('require("react/jsx-runtime")',`require(${JSON.stringify(join(root,'node_modules/react/jsx-runtime.js'))})`);
 writeFileSync(join(dir,'component.cjs'),componentText);
 const Component=require(join(dir,'component.cjs')).default;
 const html=renderToStaticMarkup(React.createElement(Component,{data}));
 assert.equal((html.match(/<svg/g)||[]).length,5);assert.ok(html.includes('最终转化率'));assert.ok(html.includes('50.0%'));assert.ok(html.includes('金额未齐'));assert.ok(html.includes('蓝色当月，橙色上月'));assert.ok(html.includes('尚未判定有效性'));assert.ok(html.includes('2026-09'));
 const output=process.env.PREVIEW_PATH;
 if(output){const css=readFileSync(join(base,'app/crm-monthly-cohort.css'),'utf8');writeFileSync(output,`<!doctype html><meta charset="utf-8"><title>月度对比组件测试（虚构测试数据）</title><style>body{font:13px system-ui;margin:16px;color:#203854}.table-wrap{overflow:auto}table{border-collapse:collapse}td,th{border-bottom:1px solid #ddd}select{border:1px solid #bbc9d8;background:white;border-radius:4px}summary{padding:4px 0}${css}</style><p>虚构测试数据 · 不写入正式数据库</p>${html}`);}
 console.log('PASS: cohort identity deduplication; repeat/cancelled/future/pre-acquisition orders; mixed currencies; missing amounts; market/source scope; prior-year boundary; uncovered/zero months; five two-color charts; customer conversion.');
}finally{rmSync(dir,{recursive:true,force:true});}
