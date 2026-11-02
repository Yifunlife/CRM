const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {approvedFirstMail}=require('./desktop-sync/first-contact-mail.cjs'),{patchFirstContactMail}=require('./desktop-sync/patch-app.cjs');
const signature='<div id="Signature">Winnie Wu — International Sales Director<img src="cid:logo"></div>',body='Hi Example,\n\nWelcome. Please contact +61478289733.';
const html='<html><body><div>Hi Example,</div><div>Welcome. Please contact <span data-outlook-trace="volatile">+61478289733.</span></div>'+signature.replace('id="Signature"','id="Signature" data-outlook-trace="new"')+'</body></html>',row={body,signatureHtml:signature};
assert(approvedFirstMail(html,row));assert(!approvedFirstMail(html.replace('Welcome.','Different message.'),row));assert(!approvedFirstMail(html.replace('Winnie Wu','Other person'),row));assert(!approvedFirstMail(html.replace('Welcome.','<a href="https://other.invalid">Welcome.</a>'),row));
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'first-mail-test-')),pdf=Buffer.from('%PDF-fixture-only'),file=path.join(dir,'(Compressed)Yifunlife Company Profile.pdf');fs.writeFileSync(file,pdf);const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),inline='aW1hZ2U=';
 const prepared={...row,clientId:'fixture',clientName:'Example',recipient:'customer@example.invalid',sender:'yifunlife@hotmail.com',subject:'Yifunlife Amusement Equipment',kind:'first',automaticFirstContact:true,status:'preparing',messageId:'draft-id',requestId:'request-id',attachment:path.basename(file),attachmentSha256:hash(pdf),attachmentGraphSize:pdf.length,attachmentUploadConfirmed:true,inlineHashes:[{cid:'logo',hash:hash(inline)}]};
 const source={status:'sent',signatureVerified:true,attachmentVerified:true,messageId:'approved-id'};let rows=[source,prepared],sends=0,altered=false;
 const patched=patchFirstContactMail(fs.readFileSync('/Users/jingwu/Desktop/Yifun Life/CRM/work/winnie-auto-first-contact-20261102/outlook-outreach.js','utf8'));const mod=new Module(path.join(dir,'sender.cjs'));mod.filename=path.join(dir,'sender.cjs');
 mod.require=name=>name==='./crm-first-contact-mail'?{approvedFirstMail}:name==='./outreach-policy'?{emailKey:v=>String(v||'').trim().toLowerCase()}:name==='./mail-integration'?{firstContact:()=>({body}),firstName:()=> 'Example'}:require(name);mod._compile(patched,mod.filename);
 const request=async(url,init)=>{const p=new URL(url);let value;
  if(init.method==='POST'&&p.pathname.endsWith('/send')){sends++;return{ok:true,status:202};}
  if(p.pathname.endsWith('/me'))value={mail:'yifunlife@hotmail.com'};
  else if(p.pathname.includes('/mailFolders/sentitems/'))value={value:[]};
  else if(p.pathname.includes('/mailFolders/drafts/'))value={value:[{id:'draft-id',toRecipients:[{emailAddress:{address:prepared.recipient}}]}]};
  else if(p.pathname.endsWith('/approved-id'))value={subject:prepared.subject,body:{content:'<html><body>'+signature+'</body></html>'}};
  else if(p.pathname.endsWith('/attachments/pdf'))value={contentBytes:pdf.toString('base64')};
  else if(p.pathname.endsWith('/attachments/logo'))value={contentId:'logo',contentBytes:inline};
  else if(p.pathname.endsWith('/attachments'))value={value:[{id:'pdf',name:path.basename(file),size:pdf.length,isInline:false},{id:'logo',isInline:true}]};
  else if(p.pathname.endsWith('/draft-id'))value={isDraft:sends===0,sentDateTime:sends?'2026-11-02T10:00:00Z':undefined,subject:prepared.subject,toRecipients:[{emailAddress:{address:prepared.recipient}}],body:{content:altered?html.replace('Welcome.','Changed.'):html}};
  else throw Error('Unexpected fixture request '+p.pathname);
  return{ok:true,status:200,json:async()=>value};
 };
 const sender=mod.exports.createOutlookOutreach({read:()=>rows,write:(_,value)=>{rows=value},token:async()=> 'fixture-only',fetch:request,material:()=>({path:file}),validateEmail:async()=>{},guard:()=>true,sleep:async()=>{}});
 altered=true;await assert.rejects(sender.send({id:'fixture',name:'Example',email:prepared.recipient},'first',async()=>{},{automaticFirstContact:true}),/实际变化/);assert.equal(sends,0);assert.equal(prepared.status,'preparing');
 altered=false;const result=await sender.send({id:'fixture',name:'Example',email:prepared.recipient},'first',async()=>{},{automaticFirstContact:true});assert.equal(sends,1);assert.equal(result.status,'sent');assert(result.signatureVerified&&result.attachmentVerified);await sender.send({id:'fixture',name:'Example',email:prepared.recipient},'first',async()=>{},{automaticFirstContact:true});assert.equal(sends,1);fs.rmSync(dir,{recursive:true});
 console.log('PASS: Outlook formatting accepted only with exact approved text/signature and safe links; modified drafts blocked; existing verified PDF/inline images rechecked; prepared draft sent once and confirmed without creating another message');
})().catch(e=>{console.error(e);process.exitCode=1});
