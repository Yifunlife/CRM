import {allocationWeights,distribute} from './allocation-server';
import {importCustomerGrade} from './contact-kind';
import {customerOwnerEligible,customerOwnerName} from './allocation-intake';
import {customerOrigin} from './customer-origin';
import {customerProfile} from './customer-profile';
import {clean,hasCustomerContact,digest,emailKey,id,now,phoneKey,wechatKey} from './crm';
import {Problem} from './api/http';
import {customerMarket} from './operations-dashboard';
export function confirmedImportAllowed(user:any,actor:any,body:any){return user?.active!==0&&actor?.active!==0&&user?.id===actor?.id&&user?.role===actor?.role&&['operations','management','ceo','admin'].includes(user?.role)&&body.confirmed_flow===true&&body.allocation_management===true&&body.allocate===false&&['domestic','whatsapp'].includes(body.form_source);}
export async function confirmedAllocationImport(db:D1Database,user:any,actor:any,body:any){
 if(!confirmedImportAllowed(user,actor,body))throw new Problem('没有此表单导入权限',403);
 if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>3000)throw new Problem('每次导入1至3000条');
 const assignUnowned=body.form_source==='domestic'&&body.assign_unowned===true;
 const at=now(),source=body.form_source==='whatsapp'?'WhatsApp／其他':'内贸表单',batchId=id();
 const [leads,users,submissions]=await Promise.all([
  db.prepare('SELECT id,name,phone,email,source,owner_id,original_owner,market,country,business_scope,detail FROM crm_leads').all<any>(),
  db.prepare("SELECT id,name,username,role,trade_scopes FROM crm_users WHERE active=1 AND role IN ('sales','ceo','management','followup')").all<any>(),
  db.prepare("SELECT id FROM crm_form_submissions WHERE id LIKE 'manual-form:%' UNION SELECT id FROM crm_customer_pool WHERE id LIKE 'manual-form:%'").all<any>()
 ]);
 const ownerKey=(value:string)=>value.trim().toLowerCase();
 const matchOwners=(value:string)=>{const key=customerOwnerName(value),exact=users.results.filter(u=>ownerKey(u.name)===key||ownerKey(u.username)===key);return exact.length?exact:/^[a-z]+$/.test(key)?users.results.filter(u=>ownerKey(u.name).split(/\s+/)[0]===key):[];};
 users.results=users.results.filter(u=>customerOwnerEligible(u,body.form_source==='domestic'?'内贸':'外贸'));
 const known=new Set(submissions.results.map(s=>s.id)),seen=new Set<string>(),rows:any[]=[],unownedIds:string[]=[],statements:D1PreparedStatement[]=[];
 for(let i=0;i<body.rows.length;i++){
  const detail=Object.fromEntries(Object.entries(body.rows[i]||{}).map(([k,v])=>[clean(k,100),clean(v)])),suppliedName=clean(detail['客户名称']||detail.name,200),phone=clean(detail['联系方式']||detail.phone,100),email=clean(detail['邮箱']||detail.email,200),pk=phoneKey(phone),ek=emailKey(email),wechat=clean(detail['微信号']||detail.wechat,500),wk=wechatKey(wechat),original=assignUnowned&&['未分配','待分配','暂无','无','—','-'].includes(clean(detail['分配业务员'],80))?'':clean(detail['分配业务员'],80),market=body.form_source==='domestic'?'内贸':'外贸';
  const ownerMatches=original?matchOwners(original):[],owner=ownerMatches.length===1?ownerMatches[0]:null,name=suppliedName||'暂无',handle=body.form_source==='whatsapp'&&!pk&&!ek&&/^@[a-z0-9._-]{2,100}$/i.test(suppliedName)?ownerKey(suppliedName):'';
  const entered=clean(detail['录入日期'],100)||(owner?'':at),date=new Date(entered.replace(/\//g,'-')),enteredDay=/^\d{4}[-/年]/.test(entered)&&Number.isFinite(date.getTime())?date.toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}):'',today=new Date(at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
  const fingerprint='manual-form:'+await digest(JSON.stringify([source,Object.keys(detail).sort().map(k=>[k,detail[k]])])),keys=[pk&&'p:'+pk,ek&&'e:'+ek,wk&&'w:'+wk,handle&&'h:'+handle].filter(Boolean) as string[];
  const reviewKey='manual-form:'+await digest(fingerprint+':review');let result='',kind='new',target:any=null;
  if(known.has(fingerprint)||known.has(reviewKey)){result='已处理过的记录，跳过';kind='duplicate';}
  else if(keys.some(k=>seen.has(k))){result='表内重复，跳过';kind='duplicate';}
  else if(!hasCustomerContact(phone,wechat)){result='无微信号和电话号码，已放弃';kind='discard';}
  else if(original&&!owner){result='原负责人未唯一匹配启用账号，待核查';kind='review';}
  else{
   const matches=leads.results.filter(l=>pk&&phoneKey(l.phone)===pk||ek&&emailKey(l.email)===ek||wk&&wechatKey(customerProfile(l).wechat)===wk||handle&&l.source==='WhatsApp／其他'&&ownerKey(l.name)===handle);
   if(matches.length===1){target=matches[0];const priorMarket=customerMarket(target);if(priorMarket!=='待确认'&&priorMarket!==market){kind='review';result='相同联系方式属于'+priorMarket+'，与本次'+market+'导入冲突，待核查';}else if(owner&&(target.owner_id&&target.owner_id!==owner.id||!target.owner_id&&target.original_owner&&!matchOwners(target.original_owner).some(u=>u.id===owner.id))){kind='review';result='原负责人存在冲突，待核查';}else{kind='existing';target.restore_owner=owner&&!target.owner_id?owner:null;result=target.restore_owner?'已有客户，按原表补齐业务员':'已有客户，保留原负责人';}}
   else if(matches.length>1){kind='review';result='联系方式匹配多个客户，待核查';}
   else if(owner){kind='owned';result='按原表负责人直接入档，不重新分配';}
   else if(name!=='暂无'&&leads.results.some(l=>l.name.trim().toLowerCase()===name.toLowerCase())){kind='review';result='同名客户，待核查';}
   else if(!enteredDay||enteredDay>today){kind='review';result='来源日期无效或在未来，待核查';}
   else if(enteredDay<'2026-11-01'){kind='historical';result='历史客资，保留资料，不进入新增分配';}
   else{result=assignUnowned?'新增客资，按内贸接收规则分配':'新增客资，保留待分配';}
  }
  keys.forEach(k=>seen.add(k));known.add(fingerprint);const grade=importCustomerGrade(detail['客户等级']||detail['等级']||detail['业务员跟进进度'],market,!detail['客户等级']&&!detail['等级']);const row={name,market,kind,result,phone,email,wechat,grade,entered:detail['录入日期']||'',requirement:detail['项目需求描述']||'',owner_name:target?users.results.find(u=>u.id===target.owner_id)?.name||target.restore_owner?.name||target.original_owner||'待分配':owner?.name||original};rows.push(row);
  if(body.preview===true||['duplicate','discard'].includes(kind))continue;
  const country=detail['所在国家/地区']||(market==='内贸'?'中国':''),method=detail['偏好联系方式']||detail['联系方式偏好']||(market==='内贸'?'微信':''),platform=['抖音','小红书','微信'].includes(detail['来源平台'])?detail['来源平台']:'抖音';
  const account=customerOrigin({source:body.form_source==='whatsapp'?'WhatsApp／其他':platform,detail}).origin_account;
  const raw=JSON.stringify({...detail,...(['乐园号','玩具号','工厂号'].includes(account)?{'来源账号':account}:{}),...(wechat?{'微信号':wechat}:{}),'客资市场':market,'来源平台':detail['来源平台']||(body.form_source==='whatsapp'?'WhatsApp':'内贸表单'),...(market==='内贸'?{'所在国家/地区':country,'偏好联系方式':method}:{})});
  if(kind==='review'){
   const poolId=reviewKey;statements.push(db.prepare("INSERT OR IGNORE INTO crm_customer_pool(id,source,raw,payload,state,target_lead_id,last_error,created,updated,created_by) VALUES(?,?,?,?,'待确认',?,?,?,?,?)").bind(poolId,body.form_source==='whatsapp'?'WhatsApp／其他':platform,raw,JSON.stringify({name,phone,email,country,province:detail['省份']||'',city:detail['城市']||'',wechat,grade,preferred_method:method,business_scope:market==='内贸'?platform==='小红书'?'xiaohongshu':platform==='微信'?'wechat':'douyin-local':'whatsapp',requirement:detail['项目需求描述']||'',market,original_owner:original,source_account:['乐园号','玩具号','工厂号'].includes(account)?account:detail['来源账号']||''}),target?.id||null,result,at,at,actor.id));continue;
  }
  if(kind==='existing'){
   statements.push(db.prepare("UPDATE crm_leads SET market=?,detail=json_set(detail,'$.客资市场',?) WHERE id=? AND market='待确认'").bind(market,market,target.id));
   if(target.restore_owner){statements.push(
    db.prepare("UPDATE crm_leads SET owner_id=?,original_owner=? WHERE id=? AND owner_id IS NULL AND original_owner=?").bind(owner.id,owner.name,target.id,target.original_owner),
    db.prepare("INSERT OR IGNORE INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) SELECT ?,'表单原归属补齐',?,?,?,? WHERE changes()>0").bind(fingerprint+':owner',target.id,JSON.stringify({owner_id:owner.id,source_owner:original,filename:clean(body.filename,200)}),at,actor.id)
   );}
   statements.push(db.prepare("INSERT OR IGNORE INTO crm_form_submissions(id,lead_id,phone,email,occurred,raw,kind,created) VALUES(?,?,?,?,?,?,'repeat',?)").bind(fingerprint,target.id,phone,email,entered,raw,at));continue;
  }
  const leadId=id();if(assignUnowned&&kind==='new')unownedIds.push(leadId);const scope=body.form_source==='whatsapp'?'whatsapp':platform==='小红书'?'xiaohongshu':platform==='微信'?'wechat':'douyin-local';
  statements.push(db.prepare("INSERT OR IGNORE INTO crm_leads(id,name,phone,email,country,source,channel,entered,owner_id,original_owner,status,detail,fingerprint,review,batch_id,created,business_scope,market,grade,cohort) SELECT ?,?,?,?,?,?,?,?,?,?,'待首次联系',?,?,0,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM crm_form_submissions WHERE id=?) AND NOT EXISTS(SELECT 1 FROM crm_leads WHERE (?<>'' AND replace(replace(replace(replace(replace(replace(phone,' ',''),'+',''),'-',''),'(',''),')',''),'.','')=?) OR (?<>'' AND lower(email)=lower(?)) OR (?<>'' AND lower(trim(COALESCE(json_extract(detail,'$._customer_profile.wechat'),json_extract(detail,'$.微信号'),'')))=?))").bind(leadId,name,phone,email,country,body.form_source==='whatsapp'?'WhatsApp／其他':detail['来源平台']||'内贸表单',detail['来源平台']||source,entered,owner?.id||null,owner?.name||original,raw,fingerprint,batchId,at,scope,market,grade,assignUnowned&&kind==='new'?'new':'unknown',fingerprint,pk,pk,email,email,wk,wk));
  statements.push(db.prepare("INSERT OR IGNORE INTO crm_form_submissions(id,lead_id,phone,email,occurred,raw,kind,created) SELECT ?,id,?,?,?,?,'new',? FROM crm_leads WHERE id=?").bind(fingerprint,phone,email,entered,raw,at,leadId));
 }
 const result={inserted:rows.filter(r=>['new','historical','owned'].includes(r.kind)).length,repeated:rows.filter(r=>r.kind==='existing').length,skipped:rows.filter(r=>['duplicate','discard'].includes(r.kind)).length,reviewed:rows.filter(r=>r.kind==='review').length,previewRows:rows,autoAssigned:0,allocationWarning:''};
 if(body.preview===true)return result;
 await db.prepare('INSERT INTO crm_batches(id,filename,source,created,creator,total) VALUES(?,?,?,?,?,?)').bind(batchId,clean(body.filename,200)||'手动表单导入',source,at,actor.id,body.rows.length).run();
 for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50));
 const actual=await db.prepare('SELECT COUNT(*) n FROM crm_leads WHERE batch_id=?').bind(batchId).first<any>();result.skipped+=result.inserted-(actual?.n||0);result.inserted=actual?.n||0;
 if(unownedIds.length){try{const {config,weights}=await allocationWeights(db);if(config.rule.automatic&&weights.length){for(let i=0;i<unownedIds.length;i+=100)result.autoAssigned+=await distribute(db,unownedIds.slice(i,i+100),'all',actor.id);}const assigned=(await db.prepare('SELECT l.id,l.owner_id,u.name FROM crm_leads l LEFT JOIN crm_users u ON u.id=l.owner_id WHERE l.id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(unownedIds)).all<any>()).results,fresh=rows.filter(r=>r.kind==='new');unownedIds.forEach((id,index)=>{const owner=assigned.find(r=>r.id===id);if(owner?.owner_id)Object.assign(fresh[index],{owner_name:owner.name,result:'已按内贸接收规则分配'});});if(result.autoAssigned<unownedIds.length)result.allocationWarning='已导入，尚未分配的客资保留待分配；请核对内贸接收名单、参与状态及现行减量规则。';}catch{result.allocationWarning='已导入，分配尚未全部完成；未分配客资已保留，请在分配管理中重试。';}}
 await db.prepare("INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) VALUES(?,'表单去重与原归属入档',?,?,?,?)").bind(id(),batchId,JSON.stringify({inserted:result.inserted,repeated:result.repeated,skipped:result.skipped,reviewed:result.reviewed,assigned:result.autoAssigned}),at,actor.id).run();
 return result;
}
