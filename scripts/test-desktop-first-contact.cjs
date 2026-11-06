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
 for(const grade of ['Yifun Staff','同事'])await assert.rejects(run({client:{grade}}),/客户资料/);
 await assert.rejects(run({payload:{assigned_at:'2026-11-02T11:00:00Z'}}),/分配时间/);
 r=await run({client:{country:'EG',whatsapp:'+96569309607'},payload:{country:'EG',recipient_key:'96569309607'}});assert.equal(r.sent,1,'complete international numbers do not depend on the customer country');
 r=await run({client:{country:'GB',whatsapp:'07911123456'},payload:{country:'GB',recipient_key:'07911123456'}});assert.equal(r.sent,1);assert.equal(r.client.whatsapp,'+447911123456');
 await assert.rejects(run({client:{country:'GB',whatsapp:'12345'},payload:{country:'GB',recipient_key:'12345'}}),/国际格式/);
 await assert.rejects(run({args:{clients:()=>[{id:'duplicate',whatsapp:'16145551234'}]}}),/号码与其他客户重合/);
 for(const stage of [2,4,5,6,7,8,9]){r=await run({client:{stage}});assert.equal(r.result.status,'skipped');assert.equal(r.sent,0);assert.equal(r.mail,0);}
 for(const client of [{status:'已成交'},{projectStatus:'已交付'},{contractNumber:'YF-confirmed'}]){r=await run({client});assert.equal(r.result.status,'skipped');assert.equal(r.sent,0);}
 r=await run({client:{stage:3}});assert.equal(r.sent,1,'a quote stage alone is not recorded as a deal');
 const historical={auto_historical_first_contact:true,historical_approved_at:new Date().toISOString(),assigned_at:'2025-01-01T00:00:00Z'};
 r=await run({payload:historical,args:{refreshFollowup:async()=>{}}});assert.equal(r.sent,1,'explicit historical approval allows an old assignment');
 await assert.rejects(run({payload:{...historical,historical_approved_at:''},args:{refreshFollowup:async()=>{}}}),/分配时间/);
 r=await run({payload:historical,args:{refreshFollowup:async()=>{},archive:()=>[{outgoing:false,channel:'email',timestamp:new Date().toISOString(),text:'reply'}]}});assert.equal(r.result.status,'skipped');assert.equal(r.sent,0);
 r=await run({payload:historical,args:{refreshFollowup:async()=>{},archive:()=>[{outgoing:true,channel:'email',speaker:'我方'}]}});assert.equal(r.result.status,'skipped');assert.equal(r.sent,0,'historical first contact never repeats any prior outgoing channel');
 const followup={auto_followup_24h:true,first_at:new Date(Date.now()-86401000).toISOString(),channel:'email',recipient_key:'customer@example.invalid'};
 const oldOutbound={outgoing:true,speaker:'Winnie Wu',channel:'whatsapp',timestamp:followup.first_at};
 r=await run({payload:followup,args:{refreshFollowup:async()=>{},archive:()=>[oldOutbound],read:name=>name==='whatsapp-outbox.json'?[{clientId:'client',status:'sent'}]:[]}});assert.equal(r.mail,1,'prior WhatsApp success allows the email followup');
 r=await run({payload:{...followup,channel:'whatsapp',recipient_key:'16145551234'},args:{refreshFollowup:async()=>{},archive:()=>[{...oldOutbound,channel:'email'}]}});assert.equal(r.sent,1,'prior email success allows the WhatsApp followup');
 r=await run({payload:followup,args:{refreshFollowup:async()=>{},archive:()=>[oldOutbound,{outgoing:false,channel:'whatsapp',timestamp:new Date().toISOString(),text:'Reply'}]}});assert.equal(r.result.status,'skipped');assert(r.result.replyAt);assert.equal(r.mail,0);
 r=await run({payload:followup,args:{refreshFollowup:async()=>{},read:name=>name==='crm-mail-outbox.json'?[{clientId:'client',status:'sent'}]:[]}});assert.equal(r.result.status,'skipped');assert.equal(r.mail,0,'a successful target channel is never repeated');
 await assert.rejects(run({payload:followup}),/缺少跟进发送前检查/);
 await assert.rejects(run({payload:{...followup,first_at:new Date().toISOString()},args:{refreshFollowup:async()=>{}}}),/尚未满24小时/);
 await assert.rejects(run({payload:followup,args:{refreshFollowup:async()=>{throw Error('CRM已取消')}}}),/CRM已取消/);
 let checks=0;r=await run({payload:followup,args:{refreshFollowup:async()=>{checks++}}});assert(checks>=2);assert.equal(r.mail,1,'reply and CRM state are rechecked by the actual sender');
 console.log('PASS: international numbers independent of country, national country completion, invalid number rejection, approved greeting/email, existing history/uncertainty/draft/owner guards; no real messages sent');
})().catch(e=>{console.error(e);process.exitCode=1});
