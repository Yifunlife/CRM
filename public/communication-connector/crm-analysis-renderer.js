(()=>{
 if(!window.crmConnection?.analyze||document.getElementById('crmAnalyzeButton'))return;
 const anchor=document.getElementById('customerArchiveButton');if(!anchor)return;
 const button=document.createElement('button');button.id='crmAnalyzeButton';button.className='button';button.textContent='AI整理重点并上传CRM';anchor.after(button);
 const dialog=document.createElement('dialog');dialog.className='modal';dialog.style.cssText='padding:0;width:min(640px,90vw);border:1px solid var(--line);color:var(--text)';dialog.setAttribute('aria-labelledby','crmAnalysisTitle');
 dialog.innerHTML='<div class="modal-head"><h2 id="crmAnalysisTitle">聊天重点</h2><button class="modal-close" type="button" aria-label="关闭聊天重点">×</button></div><div class="modal-body"><p id="crmAnalysisMessage" role="status" aria-live="polite"></p><div id="crmAnalysisFields"></div><p style="color:var(--muted)">只上传当前客户的重点摘要。日常聊天原文保存在本机。</p></div><div class="modal-actions"><button class="button" id="crmAnalyzeAgain" type="button">重新整理并上传</button></div>';document.body.appendChild(dialog);
 const field=id=>dialog.querySelector('#'+id),pending=row=>row&&['preparing','queued','running'].includes(row.state);let selected='',busy=false,latest=null;
 function render(row){
  latest=row;
  field('crmAnalyzeAgain').disabled=!!(pending(row)&&row.jobId)||busy;field('crmAnalysisFields').replaceChildren();
  field('crmAnalysisMessage').textContent=row?.state==='done'?'重点已同步至CRM · '+new Date(row.syncedAt).toLocaleString():row?.error||'正在由工作台AI整理，完成后自动上传重点…';
  if(row?.analysis)for(const [key,label] of [['needs','客户需求'],['confirmed','已确认事项'],['pending','待核实项'],['nextStep','建议下一步']]){const h=document.createElement('h3'),p=document.createElement('p');h.textContent=label;p.textContent=row.analysis[key]||'待核实';p.style.whiteSpace='pre-line';field('crmAnalysisFields').append(h,p);}
 }
 async function poll(){if(!dialog.open||!selected||busy)return;const id=selected;try{const row=await window.crmConnection.analysisStatus(id);if(selected===id&&row)render(row);}catch{field('crmAnalysisMessage').textContent='暂时无法核对CRM结果，原任务保留，稍后会继续核对。';}}
 async function start(){if(busy||!selected)return;busy=true;field('crmAnalyzeAgain').disabled=true;const id=selected;try{const row=await window.crmConnection.analyze(id);if(selected===id)render(row);}catch(error){field('crmAnalysisMessage').textContent=error.message;}finally{busy=false;field('crmAnalyzeAgain').disabled=!!(pending(latest)&&latest.jobId);}}
 button.addEventListener('click',async()=>{const c=typeof activeClient!=='undefined'?activeClient:null;if(!c||c.group){window.alert('请先选择本人客户会话');return;}selected=c.id;const id=selected;latest=null;field('crmAnalysisTitle').textContent=c.name+' · 聊天重点';dialog.showModal();field('crmAnalysisFields').replaceChildren();field('crmAnalysisMessage').textContent='正在核对整理任务…';try{const row=await window.crmConnection.analysisStatus(selected);if(selected!==id)return;if(row){render(row);return;}}catch{}await start();});
 field('crmAnalyzeAgain').addEventListener('click',start);dialog.querySelector('.modal-close').addEventListener('click',()=>dialog.close());setInterval(poll,3000);
})();
