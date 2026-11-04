import {clean,digest,emailKey,id,now,phoneKey} from './crm';
import {Problem} from './api/http';
import {distribute} from './allocation-server';
export function confirmedImportAllowed(user:any,actor:any,body:any){return user?.active!==0&&actor?.active!==0&&user?.id===actor?.id&&user?.role===actor?.role&&['operations','management','ceo','admin'].includes(user?.role)&&body.confirmed_flow===true&&body.allocation_management===true&&body.allocate===false&&['domestic','whatsapp'].includes(body.form_source);}
export async function confirmedAllocationImport(db:D1Database,user:any,actor:any,body:any){
 if(!confirmedImportAllowed(user,actor,body))throw new Problem('没有此表单导入权限',403);
 if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>3000)throw new Problem('每次导入1至3000条');
 const at=now(),source=body.form_source==='whatsapp'?'WhatsApp／其他':'内贸表单',batchId=id();
 const [leads,users,submissions]=await Promise.all([
  db.prepare('SELECT id,name,phone,email,owner_id,original_owner FROM crm_leads').all<any>(),
  db.prepare("SELECT id,name FROM crm_users WHERE active=1 AND role IN ('sales','ceo','management')").all<any>(),
  db.prepare("SELECT id FROM crm_form_submissions WHERE id LIKE 'manual-form:%' UNION SELECT id FROM crm_customer_pool WHERE id LIKE 'manual-form:%'").all<any>()
 ]);
 const known=new Set(submissions.results.map(s=>s.id)),seen=new Set<string>(),rows:any[]=[],statements:D1PreparedStatement[]=[],newIds:string[]=[];
 for(let i=0;i<body.rows.length;i++){
  const detail=Object.fromEntries(Object.entries(body.rows[i]||{}).map(([k,v])=>[clean(k,100),clean(v)])),name=clean(detail['客户名称']||detail.name,200),phone=clean(detail['联系方式']||detail.phone,100),email=clean(detail['邮箱']||detail.email,200),pk=phoneKey(phone),ek=emailKey(email),original=clean(detail['分配业务员'],80),market=body.form_source==='domestic'?'内贸':['内贸','外贸'].includes(detail['客资市场'])?detail['客资市场']:'待确认';
  const entered=clean(detail['录入日期'],100)||at,date=new Date(entered.replace(/\//g,'-')),enteredDay=/^\d{4}[-/年]/.test(entered)&&Number.isFinite(date.getTime())?date.toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}):'',today=new Date(at).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
  const fingerprint='manual-form:'+await digest(JSON.stringify([source,Object.keys(detail).sort().map(k=>[k,detail[k]])])),keys=[pk&&'p:'+pk,ek&&'e:'+ek].filter(Boolean) as string[];
  const reviewKey='manual-form:'+await digest(fingerprint+':review');let result='',kind='new',target:any=null;
  if(known.has(fingerprint)||known.has(reviewKey)){result='已处理过的记录，跳过';kind='duplicate';}
  else if(keys.some(k=>seen.has(k))){result='表内重复，跳过';kind='duplicate';}
  else if(!name||!keys.length){result='姓名或联系方式缺失，待核查';kind='review';}
  else{
   const matches=leads.results.filter(l=>pk&&phoneKey(l.phone)===pk||ek&&emailKey(l.email)===ek);
   if(matches.length===1){target=matches[0];if(original&&![target.original_owner,users.results.find(u=>u.id===target.owner_id)?.name].includes(original)){kind='review';result='原负责人存在冲突，待核查';}else{kind='existing';result='已有客户，保留原负责人';}}
   else if(matches.length>1){kind='review';result='联系方式匹配多个客户，待核查';}
   else if(market==='待确认'){kind='review';result='内外贸业务范围待确认';}
   else if(leads.results.some(l=>l.name.trim().toLowerCase()===name.toLowerCase())){kind='review';result='同名客户，待核查';}
   else if(!enteredDay||enteredDay>today){kind='review';result='来源日期无效或在未来，待核查';}
   else if(enteredDay<'2026-11-01'){kind='historical';result='历史客资，保留资料，不进入新增分配';}
   else{result=original?'保留原负责人，不进入新增分配':'新增客资，进入规则分配';}
  }
  keys.forEach(k=>seen.add(k));known.add(fingerprint);const row={name,market,kind,result,phone,email,entered:detail['录入日期']||'',requirement:detail['项目需求描述']||'',owner_name:target?users.results.find(u=>u.id===target.owner_id)?.name||target.original_owner||'待分配':original};rows.push(row);
  if(body.preview===true||kind==='duplicate')continue;
  const raw=JSON.stringify({...detail,'客资市场':market,'来源平台':detail['来源平台']||(body.form_source==='whatsapp'?'WhatsApp':'内贸表单')});
  if(kind==='review'){
   const poolId=reviewKey;statements.push(db.prepare("INSERT OR IGNORE INTO crm_customer_pool(id,source,raw,payload,state,target_lead_id,last_error,created,updated,created_by) VALUES(?,?,?,?,'待确认',?,?,?,?,?)").bind(poolId,body.form_source==='whatsapp'?'WhatsApp／其他':'抖音',raw,JSON.stringify({name,phone,email,country:detail['所在国家/地区']||'',requirement:detail['项目需求描述']||'',market,original_owner:original,source_account:detail['来源账号']||''}),target?.id||null,result,at,at,actor.id));continue;
  }
  if(kind==='existing'){
   statements.push(db.prepare("INSERT OR IGNORE INTO crm_form_submissions(id,lead_id,phone,email,occurred,raw,kind,created) VALUES(?,?,?,?,?,?,'repeat',?)").bind(fingerprint,target.id,phone,email,entered,raw,at));continue;
  }
  const matches=users.results.filter(u=>u.name===original),owner=original&&matches.length===1?matches[0].id:null,leadId=id(),scope=body.form_source==='whatsapp'?'whatsapp':'douyin-local';
  statements.push(db.prepare("INSERT OR IGNORE INTO crm_leads(id,name,phone,email,country,source,channel,entered,owner_id,original_owner,status,detail,fingerprint,review,batch_id,created,business_scope,cohort) SELECT ?,?,?,?,?,?,?,?,?,?,'待首次联系',?,?,0,?,?,?,'unknown' WHERE NOT EXISTS(SELECT 1 FROM crm_form_submissions WHERE id=?) AND NOT EXISTS(SELECT 1 FROM crm_leads WHERE (?<>'' AND replace(replace(replace(replace(replace(replace(phone,' ',''),'+',''),'-',''),'(',''),')',''),'.','')=?) OR (?<>'' AND lower(email)=lower(?)))").bind(leadId,name,phone,email,detail['所在国家/地区']||'',body.form_source==='whatsapp'?'WhatsApp／其他':detail['来源平台']||'内贸表单',detail['来源平台']||source,entered,owner,original,raw,fingerprint,batchId,at,scope,fingerprint,pk,pk,email,email));
  statements.push(db.prepare("INSERT OR IGNORE INTO crm_form_submissions(id,lead_id,phone,email,occurred,raw,kind,created) SELECT ?,id,?,?,?,?,'new',? FROM crm_leads WHERE id=?").bind(fingerprint,phone,email,entered,raw,at,leadId));if(!original&&kind==='new')newIds.push(leadId);
 }
 const result={inserted:rows.filter(r=>['new','historical'].includes(r.kind)).length,repeated:rows.filter(r=>r.kind==='existing').length,skipped:rows.filter(r=>r.kind==='duplicate').length,reviewed:rows.filter(r=>r.kind==='review').length,previewRows:rows,autoAssigned:0,allocationWarning:''};
 if(body.preview===true)return result;
 await db.prepare('INSERT INTO crm_batches(id,filename,source,created,creator,total) VALUES(?,?,?,?,?,?)').bind(batchId,clean(body.filename,200)||'手动表单导入',source,at,actor.id,body.rows.length).run();
 for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50));
 const actual=await db.prepare('SELECT COUNT(*) n FROM crm_leads WHERE batch_id=?').bind(batchId).first<any>();result.skipped+=result.inserted-(actual?.n||0);result.inserted=actual?.n||0;
 if(body.confirm_allocate===true&&newIds.length){try{result.autoAssigned=await distribute(db,newIds,'all',actor.id);}catch{result.allocationWarning='导入已保存，规则分配尚未完成；未分配记录保留待分配，请到分配管理核查。';}}
 await db.prepare("INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) VALUES(?,'表单去重与规则分配',?,?,?,?)").bind(id(),batchId,JSON.stringify({inserted:result.inserted,repeated:result.repeated,skipped:result.skipped,reviewed:result.reviewed,assigned:result.autoAssigned}),at,actor.id).run();
 return result;
}
