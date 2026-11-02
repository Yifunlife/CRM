const traceNeutral=value=>String(value||'').replace(/ data-outlook-trace="[^"]*"/g,'');
function plain(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[n.toLowerCase()]).replace(/\s+/g,' ').trim();}
function approvedFirstMail(html,row){
 const index=String(html||'').indexOf('<div id="Signature"');if(index<0)return false;
 const body=html.slice(0,index).replace(/^[\s\S]*?<body[^>]*>/i,''),signature=html.slice(index).replace(/<\/body>[\s\S]*$/i,'');
 if(traceNeutral(signature)!==traceNeutral(row.signatureHtml)||plain(body)!==String(row.body||'').replace(/\s+/g,' ').trim())return false;
 return [...body.matchAll(/href="([^"]*)"/gi)].every(([,href])=>/^https?:\/\/(?:www\.)?yifunlife\.com\/?$/i.test(href)||/^tel:\+?61478289733$/i.test(href));
}
module.exports={approvedFirstMail};
async function sameFirstDraft(drafts,immutableId,graph){
 const aliases=drafts.filter(d=>d.id!==immutableId).map(d=>d.id);if(!aliases.length)return true;
 const converted=await graph('/me/translateExchangeIds','POST',{inputIds:aliases,sourceIdType:'restId',targetIdType:'restImmutableEntryId'});
 return aliases.every(id=>converted.value?.some(value=>value.sourceId===id&&value.targetId===immutableId));
}
module.exports.sameFirstDraft=sameFirstDraft;
