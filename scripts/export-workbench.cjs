// Read-only export. Never loads credentials, login databases, or desktop drafts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.argv[2],output=process.argv[3];
if(!root||!output)throw Error('Usage: node scripts/export-workbench.cjs <workbench directory> <output.json>');
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}};
const crm=read(path.join(root,'crm.json'),{}),config=read(path.join(root,'auto-reception-config.json'),{});
const clients=(crm.clients||[]).filter(c=>!c.deleted&&!c.group&&String(c.owner||'').toLowerCase()==='winnie').map(c=>{
 const archive=read(path.join(root,'customer-archives',crypto.createHash('sha256').update(c.id).digest('hex')+'.json'),{});
 return {id:c.id,name:c.name,phone:c.whatsapp||'',email:c.email||'',country:c.country||'',stage:c.projectStatus||'',messages:(archive.messages||[]).slice(-80).map(m=>({channel:m.channel,timestamp:m.timestamp,speaker:m.speaker,subject:m.subject||'',text:String(m.text||'').slice(0,4000)}))};
});
const scenes=(config.scenes||[]).map(s=>({id:s.id,name:s.name,reply:s.reply}));
const payload=JSON.stringify({format:'yifun-workbench-v1',owner:'winnie',captured_at:new Date().toISOString(),clients,scenes});
if(Buffer.byteLength(payload)>4500000)throw Error('Export exceeds 4.5MB; reduce history window before uploading.');
fs.writeFileSync(output,payload,{mode:0o600,flag:'wx'});console.log(JSON.stringify({clients:clients.length,scenes:scenes.length,bytes:Buffer.byteLength(payload)}));
