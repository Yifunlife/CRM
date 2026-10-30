import { BUSINESS_SCOPES } from '../allocation';
import { allocationWeights,distribute } from '../allocation-server';
import { syncAssignments } from '../assignment-sync';
import { clean,digest,emailKey,id,now,phoneKey,SOURCES,STATUSES } from '../crm';
import { importForms } from '../form-intake';
import type { ApiContext } from './context';
import { json,Problem } from './http';
export async function customerImport({db,req,path,write,body,user,actor}:ApiContext):Promise<Response|undefined>{
  if(path==='import-assignments'&&req.method==='POST')return json(await syncAssignments(db,user,body));
  if(path==='business-scope'&&req.method==='POST'){
   const lead:any=await db.prepare('SELECT id,source FROM crm_leads WHERE id=?').bind(body.id).first(),business=BUSINESS_SCOPES.find(v=>v.id===body.scope);
   if(!lead||!business||business.source!==lead.source)throw new Problem('业务范围必须与客资来源匹配');
   if(await db.prepare('SELECT id FROM crm_deals WHERE lead_id=? LIMIT 1').bind(body.id).first())throw new Problem('已有成交记录的客资不能更改业务范围');
   await db.prepare('UPDATE crm_leads SET business_scope=? WHERE id=?').bind(business.id,lead.id).run();return json({ok:true});
  }
  if (path === "batches" && !write) return json((await db.prepare("SELECT b.*,u.name AS author,(SELECT COUNT(*) FROM crm_leads l WHERE l.batch_id=b.id) AS inserted FROM crm_batches b JOIN crm_users u ON u.id=b.creator ORDER BY b.created DESC LIMIT 100").all()).results);
  if (path === "assign" && req.method === "POST") {
   throw new Problem("新增客户已统一平均分配，请刷新页面使用全渠道共同平均分配；已有客户交接请使用交接流程",409);
  }
  if(path === "review" && req.method === "POST") { await db.prepare("UPDATE crm_leads SET review=0 WHERE id=? AND owner_id IS NULL").bind(body.id).run();return json({ok:true}); }
  if (path === "import" && req.method === "POST") {
   if(!SOURCES.includes(body.source)||!Array.isArray(body.rows)||!body.rows.length||body.rows.length>3000)throw new Problem("请选择来源，每次导入1至3000条");
   const businessScope=clean(body.business_scope,80),business=BUSINESS_SCOPES.find(s=>s.id===businessScope);
   if(businessScope&&(!business||business.source!==body.source))throw new Problem('业务范围与来源渠道不匹配');
   if(body.source==='Meta'&&body.rows.every((r:any)=>r.id&&r.form_id))return json(await importForms(db,body.rows,actor.id,{scope:businessScope,filename:clean(body.filename,200),preview:body.preview===true}));
   const autoIds:string[]=[];
   const allUsers = (await db.prepare("SELECT id,name FROM crm_users WHERE active=1 AND role='sales'").all()).results;
   const existing: any[] = (await db.prepare("SELECT phone,email,fingerprint FROM crm_leads").all()).results;
   const fingerprints = new Set(existing.map(r=>r.fingerprint)), phones = new Set(existing.map(r=>phoneKey(r.phone)).filter(Boolean)), emails = new Set(existing.map(r=>emailKey(r.email)).filter(Boolean));
   const batchId=id(); let inserted=0,skipped=0,reviewed=0,unmatched=0;
   const statements = [db.prepare("INSERT INTO crm_batches(id,filename,source,created,creator,total) VALUES(?,?,?,?,?,?)").bind(batchId,clean(body.filename,200)||"人工新增",body.source,now(),user.id,body.rows.length)];
   for(const raw of body.rows) {
    const detail: Record<string,string> = {};for(const [k,v] of Object.entries(raw))detail[clean(k,100)]=clean(v);
    const name = clean(detail["客户名称"]||detail["姓名"]||detail["name"],200),phone=clean(detail["联系方式"]||detail["电话"]||detail["phone"],100),email=clean(detail["邮箱"]||detail["email"],200);
    if(!name || (!phone && !email)) { skipped++;continue; }
    const metaId = body.source === "Meta" && detail["form_id"] ? clean(detail["id"],200) : "";
    const fingerprint = await digest(metaId ? "Meta:lead:"+metaId : body.source+JSON.stringify(Object.keys(detail).sort().map(k=>[k,detail[k]])));
    if(fingerprints.has(fingerprint)){skipped++;continue;}fingerprints.add(fingerprint);
    const pk=phoneKey(phone),ek=emailKey(email),review=(pk && phones.has(pk)) || (ek && emails.has(ek)) ? 1:0;
    if(pk)phones.add(pk);if(ek)emails.add(ek);if(review)reviewed++;
    const original=clean(detail["分配业务员"],80),matches=allUsers.filter((u:any)=>u.name===original);
    const owner = original && matches.length===1 ? matches[0].id : null;if(original&&!owner)unmatched++;
    const old=detail["跟进状态"],status=STATUSES.includes(old)?old:old==="已联系"?"已联系待回复":old==="在沟通"?"正在沟通":"待首次联系";
    const leadId=id();if(!original&&!review&&businessScope)autoIds.push(leadId);
    statements.push(db.prepare("INSERT OR IGNORE INTO crm_leads(id,name,phone,email,country,source,channel,entered,owner_id,original_owner,status,detail,fingerprint,review,batch_id,created,business_scope) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(leadId,name,phone,email,clean(detail["所在国家/地区"],100),body.source,clean(detail["来源渠道"],100),clean(detail["录入日期"],100),owner,original,status,JSON.stringify(detail),fingerprint,review,batchId,now(),businessScope));inserted++;
   }
   for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50));let autoAssigned=0,allocationWarning='';if(businessScope&&autoIds.length){const {config,weights}=await allocationWeights(db,businessScope);if(config.rule.automatic&&weights.length){try{for(let i=0;i<autoIds.length;i+=100)autoAssigned+=await distribute(db,autoIds.slice(i,i+100),businessScope,user.id);}catch{allocationWarning='导入已保存，自动分配未完成，请到客户管理处理剩余待分配记录';}}else if(config.rule.automatic)allocationWarning='没有可参与的业务员，客资保留待分配';}return json({inserted,skipped,reviewed,unmatched,autoAssigned,allocationWarning});
  }
}
