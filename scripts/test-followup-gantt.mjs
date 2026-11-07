import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

const temp=mkdtempSync(join(tmpdir(),'crm-gantt-'));
try{
 const compiled=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import Timeline from './app/followup-timeline';import {previewFollowup,previewOrders} from './lib/crm-preview-data';export {previewFollowup,previewOrders};export function render(orders){return renderToStaticMarkup(<Timeline filters={null} orders={orders} tasks={[]} people={[]} canEdit={false} demo={true} api={async()=>({})} onSaved={()=>{}} selected="" onNode={()=>{}} onClose={()=>{}} renderNode={()=>null}/>);}`,resolveDir:resolve('.'),loader:'tsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},write:false,define:{'process.env.NODE_ENV':'"production"'}});
 const file=join(temp,'gantt.cjs');writeFileSync(file,compiled.outputFiles[0].text);
 const {render,previewFollowup,previewOrders}=createRequire(import.meta.url)(file),OriginalDate=Date;
 globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-11-07T01:00:00Z']));}};
 try{
  const data=previewFollowup(),html=render(data.orders);
  assert.equal((html.match(/class="ft-row ft-project"/g)||[]).length,6);
  assert.equal((html.match(/class="ft-bar /g)||[]).length,35,'approved demo shows each scheduled stage as its own named bar');
  assert.ok(!/×\d/.test(html),'never replace stage names with aggregate counts');
  assert.ok(!html.includes('ft-phase'),'never add seven expanded rows');
  assert.match(html,/生产跟进/);assert.match(html,/单证制作/);
  assert.equal(data.orders[0].details.business_process['生产跟进'].start,'2026-11-03');
  assert.equal(data.orders[0].details.business_process['生产跟进'].due,'2026-11-13');
  const same=structuredClone(data.orders[0]);
  for(const phase of Object.values(same.details.business_process)){phase.start='2026-11-07';phase.due='2026-11-07';}
  const overlap=render([same]);
  assert.equal((overlap.match(/class="ft-bar /g)||[]).length,7,'even same-day stages remain separately addressable');
  assert.ok(!/×\d/.test(overlap));
  assert.equal(previewOrders()[0].details.business_process['生产跟进'].due,'2026-11-05','other project previews keep their existing data');
 }finally{globalThis.Date=OriginalDate;}
 console.log('PASS: approved named Gantt bars, compact project rows, independent coincident stages, approved sample dates and unchanged other previews.');
}finally{rmSync(temp,{recursive:true,force:true});}
