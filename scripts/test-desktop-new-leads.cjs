const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createAccountSync}=require('./desktop-sync/account-sync.cjs');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-new-leads-')),file=path.join(root,'config.json'),config={enabled:true,accountSync:true,origin:'https://yifun-crm.yifunlife.workers.dev',owner_id:'sales',token:'fixture',workspace:root,localOwner:'Winnie',pullOnly:true};
 fs.writeFileSync(file,JSON.stringify(config));let data={clients:[{id:'old-local',owner:'Winnie',name:'Preserve original',notes:'Original notes'}]},requests=[],lose=true;
 const keys=['name','country','whatsapp','email','grade','nextContact'],values=c=>Object.fromEntries(keys.map(k=>[k,String(c[k]||'')]));
 const sync=createAccountSync({configFile:file,root:()=>root,state:()=>structuredClone(data),save:next=>data=next,profile:c=>({...c}),archive:()=>[],scenes:()=>[],request:async(_url,o)=>{
  const s=JSON.parse(o.body).sync;requests.push(s);if(s.new_clients.length&&lose){lose=false;throw Error('lost response');}
  return {ok:true,json:async()=>({owner_id:'sales',uploaded:s.new_clients.map(id=>({desktop_id:id,lead_id:'new-lead',created:true})),updates:s.clients.map(c=>({desktop_id:c.id,lead_id:c.id==='new-local'?'new-lead':'old-lead',values:c.id==='new-local'?values(c):{...values(c),name:'Different CRM name'}})),conflicts:[],blocked:[]})};
 }});
 await sync.tick();assert.deepEqual(requests.at(-1).new_clients,[]);
 config.uploadNewLeads=true;fs.writeFileSync(file,JSON.stringify(config));await sync.tick();assert.deepEqual(requests.at(-1).new_clients,[],'enabling creates a baseline after earlier download-only rounds');
 data.clients.push({id:'new-local',owner:'Winnie',name:'New on desktop',whatsapp:'61400000005'},{id:'crm-from-server',owner:'Winnie',name:'Already imported'},{id:'other-owner',owner:'Other',name:'Private'},{id:'deleted',owner:'Winnie',name:'Deleted',deleted:true},{id:'group',owner:'Winnie',name:'Group',group:true});
 await sync.tick();assert.deepEqual(requests.at(-1).new_clients,['new-local']);assert.match(sync.error(),/lost response/);
 await sync.tick();assert.deepEqual(requests.at(-1).new_clients,['new-local'],'a lost response retries the same local ID');
 const journal=JSON.parse(fs.readFileSync(path.join(root,'.workbench/crm-account-sync.json')));assert.ok(journal.created_leads.includes('new-local'));assert.ok(journal.upload_baseline.includes('new-local'));
 await sync.tick();assert.deepEqual(requests.at(-1).new_clients,[]);assert.deepEqual(requests.at(-1).bindings.map(b=>b.desktop_id),['new-local'],'old customer baselines remain download-only');assert.equal(data.clients[0].name,'Preserve original');assert.equal(data.clients[0].notes,'Original notes');
 data.clients.find(c=>c.id==='new-local').name='Updated desktop name';await sync.tick();assert.equal(requests.at(-1).clients.find(c=>c.id==='new-local').name,'Updated desktop name');assert.equal(data.clients.find(c=>c.id==='new-local').name,'Updated desktop name');
 fs.rmSync(root,{recursive:true});console.log('PASS: existing-customer baseline, future local upload, lost-response retry, persisted acknowledgement, local-created update scope, imported/private/deleted/group exclusions and original data preservation');
})().catch(e=>{console.error(e.message);process.exitCode=1});
