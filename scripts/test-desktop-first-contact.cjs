const assert=require('node:assert/strict'),{firstContact}=require('./desktop-sync/first-contact.cjs');
const run=async(overrides={})=>{
 const client={id:'client',owner:'Winnie',name:'Example customer',country:'US',whatsapp:'+16145551234',email:'customer@example.invalid'},p={auto_first_contact:true,assigned_at:'2026-11-02T13:00:00Z',name:client.name,country:'US',channel:'whatsapp',recipient_key:'16145551234',text:'Approved greeting'};
 let sent=0,mail=0;
 const args={phonePolicy:require('/Users/jingwu/Desktop/Yifun Life/Yifun-V1-macOS-USB/workbench-v1/outreach-policy'),command:{id:'unique-command',desktop_id:'client',payload:p},config:{owner_id:'winnie',localOwner:'Winnie',autoFirstContact:{owner_id:'winnie',assigned_from:'2026-11-02T12:00:00Z'}},getClient:()=>client,clients:()=>[client],read:()=>[],draft:()=>({}),archive:()=>[],whatsappHistory:async()=>false,normalizePhone:(_,value)=>{client.whatsapp=value},sendWhatsApp:async(c,text,guard)=>{assert(guard());assert.equal(text,p.text);sent++;return{status:'sent',messageId:'receipt-wa'}},sendEmail:async(c,check)=>{await check();mail++;return{status:'sent',messageId:'receipt-mail',body:'Existing approved mail template',signatureVerified:true,attachmentVerified:true}},active:()=>true};
 if(overrides.client)Object.assign(client,overrides.client);if(overrides.payload)Object.assign(p,overrides.payload);Object.assign(args,overrides.args||{});
 const result=await firstContact(args);return{result,sent,mail,client};
};
(async()=>{
 const {patchFirstContactMain}=require('./desktop-sync/patch-app.cjs');const sample=" const management=require('./crm-client-management');\nreception:receptionConfig().enabled,error:crmAccountSync?.error()";const patched=patchFirstContactMain(sample);assert(patched.includes("company:'(Compressed)Yifunlife Company Profile.pdf'"));assert.equal(patchFirstContactMain(patched),patched);

 let r=await run();assert.equal(r.sent,1);assert.equal(r.result.messageId,'receipt-wa');
 r=await run({payload:{channel:'email',recipient_key:'customer@example.invalid'}});assert.equal(r.mail,1);assert.equal(r.result.text,'Existing approved mail template');
 r=await run({client:{country:'SA',whatsapp:'0592525928'},payload:{country:'SA',recipient_key:'0592525928'}});assert.equal(r.client.whatsapp,'+966592525928');assert.equal(r.sent,1);
 for(const args of [{read:()=>[{clientId:'client',status:'sent'}]},{read:()=>[{clientId:'client',status:'uncertain'}]},{archive:()=>[{speaker:'Winnie Wu',text:'prior message'}]},{whatsappHistory:async()=>true}]){r=await run({args});assert.equal(r.result.status,'skipped');assert.equal(r.sent,0);assert.equal(r.mail,0);}
 await assert.rejects(run({args:{active:()=>false}}),/工作区|客户资料/);
 await assert.rejects(run({args:{draft:()=>({draft:'human draft'})}}),/草稿/);
 await assert.rejects(run({client:{owner:'Other'}}),/归属/);
 await assert.rejects(run({payload:{assigned_at:'2026-11-02T11:00:00Z'}}),/分配时间/);
 await assert.rejects(run({client:{country:'EG',whatsapp:'+96569309607'},payload:{country:'EG',recipient_key:'96569309607'}}),/国家冲突/);
 await assert.rejects(run({args:{clients:()=>[{id:'duplicate',whatsapp:'16145551234'}]}}),/号码与其他客户重合/);
 console.log('PASS: approved WhatsApp greeting, original email adapter, country-based normalization, existing sent/uncertain/history suppression, ownership/draft/workspace/cutoff guards and country/duplicate conflicts; no real messages sent');
})().catch(e=>{console.error(e);process.exitCode=1});
