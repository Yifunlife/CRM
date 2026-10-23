import {AllocationError} from './allocation-server';
import {id,now,can,permissionOverrides} from './crm';
import {ORDER_STEPS,ORDER_FIELDS,LOGISTICS_FIELDS,ORDER_DATES,blankSteps,orderToday} from './order-followup';
import {ORDER_IMPORT_COLUMNS,ORDER_IMPORT_LIMIT,importStage} from './order-import';
const norm=(value:string)=>value.trim().toLowerCase();
export async function importOrders(db:D1Database,user:any,actor:any,body:any){
 if(!body||!Array.isArray(body.rows)||!body.rows.length||body.rows.length>ORDER_IMPORT_LIMIT)throw new AllocationError(`请选择1–${ORDER_IMPORT_LIMIT}条项目记录`);
 if(!['preview','import'].includes(body.mode))throw new AllocationError('导入操作无效');
 if(new TextEncoder().encode(JSON.stringify(body.rows)).byteLength>1_500_000)throw new AllocationError('本批内容超过1.5MB，请拆分文件');
 const filename=typeof body.filename==='string'?body.filename.trim().slice(0,200):'历史项目表格';
 const users=(await db.prepare('SELECT id,name,username,role,permissions FROM crm_users WHERE active=1').all()).results as any[];
 const staff=(await db.prepare('SELECT user_id FROM crm_followup_staff').all()).results as any[];
 const leads=(await db.prepare('SELECT id,name,owner_id FROM crm_leads').all()).results as any[];
 const existing=new Set((await db.prepare('SELECT order_number FROM crm_followup_orders').all()).results.map((o:any)=>norm(o.order_number)));
 const allowed=new Set(ORDER_IMPORT_COLUMNS.map(c=>c.key)),people=(value:string)=>users.filter(u=>norm(u.username)===norm(value)||norm(u.name)===norm(value));
 const seen=new Set<string>(),prepared:any[]=[],results:any[]=[];
 for(let i=0;i<body.rows.length;i++){
  const raw=body.rows[i],errors:string[]=[];
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){results.push({row:i+1,status:'待修正',errors:['项目行格式无效']});continue;}
  const row:Record<string,string>={};
  for(const [key,value] of Object.entries(raw)){
   if(!allowed.has(key as any)){errors.push('包含不支持的字段：'+key);continue;}
   if(typeof value!=='string'){errors.push('表格内容必须为文字');continue;}
   row[key]=value.trim();if(row[key].length>2000)errors.push('单个字段不能超过2000字');
  }
  const number=row.order_number||'',project=row.project||'',key=norm(number);
  const result:any={row:i+1,order_number:number,project,customer_name:row.customer_name||'',status:'可导入',errors};
  if(number&&(existing.has(key)||seen.has(key))){result.status='跳过';result.reason=existing.has(key)?'订单号已存在，不覆盖已有跟单':'表格内订单号重复，保留首次出现的记录';results.push(result);continue;}
  if(number)seen.add(key);
  if(!number||number.length>100)errors.push('合同／订单编号必填，最多100字');
  if(!project||project.length>200)errors.push('项目名称必填，最多200字');
  const commercials=row.commercial?people(row.commercial):[];
  if(row.commercial&&commercials.length!==1)errors.push('商务负责人未唯一匹配启用账号，请填写准确用户名');
  const candidates=row.lead_id?leads.filter(l=>l.id===row.lead_id):leads.filter(l=>norm(l.name)===norm(row.customer_name||''));
  const matches=row.commercial&&commercials.length===1?candidates.filter(l=>l.owner_id===commercials[0].id):candidates;
  const lead=matches.length===1?matches[0]:null;
  if(!lead)errors.push(matches.length>1?'客户重名，请填写CRM客户ID或商务负责人':'未找到唯一CRM客户，请先导入客户并分配业务员');
  if(lead&&row.customer_name&&norm(lead.name)!==norm(row.customer_name))errors.push('CRM客户ID与客户名称不一致');
  const commercial=lead?users.find(u=>u.id===lead.owner_id):null;
  if(lead&&!commercial)errors.push('客户尚未分配启用的商务账号');
  const fallback=typeof body.default_logistics_id==='string'?body.default_logistics_id:'';
  const logisticsMatches=row.logistics?people(row.logistics):users.filter(u=>u.id===fallback);
  const logistics=logisticsMatches.length===1?logisticsMatches[0]:null;
  if(!logistics||!can(logistics,'followup_edit')&&!(permissionOverrides(logistics).followup_edit!==false&&staff.some(s=>s.user_id===logistics.id)))errors.push('后勤负责人需唯一匹配管理员或指定后勤账号，可选择默认后勤');
  const stage=importStage(row.stage||'');if(stage<0)errors.push('当前阶段须为1–12或完整阶段名称');
  const details:any={dates:{},history_note:row.history_note||''};
  for(const [field] of [...ORDER_FIELDS,...LOGISTICS_FIELDS])details[field]=row[field]||'';
  for(const [field,label] of ORDER_DATES){const value=row[field];if(!value)continue;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value){errors.push(label+'日期无效，请填写YYYY-MM-DD');continue;}
   if(field==='actual_ship'&&value>orderToday())errors.push('实际发货日期不能晚于今天');
   // The upload time is not the original information-confirmation time.
   details.dates[field]={date:value,kind:field==='actual_ship'?'实际':'预计',source:'历史表格：'+filename,confirmed_at:'',sync_record:'',imported:true};
  }
  result.customer_name=lead?.name||result.customer_name;result.commercial_name=commercial?.name||row.commercial||'';result.logistics_name=logistics?.name||row.logistics||'';result.stage_name=stage>=0?ORDER_STEPS[stage].name:row.stage;
  if(errors.length)result.status='待修正';
  else prepared.push({id:id(),order_number:number,project,lead_id:lead.id,commercial_id:commercial.id,logistics_id:logistics.id,stage,details:JSON.stringify(details),steps:JSON.stringify(blankSteps()),source_row:i+1});
  results.push(result);
 }
 const summary={total:results.length,ready:results.filter(r=>r.status==='可导入').length,skipped:results.filter(r=>r.status==='跳过').length,invalid:results.filter(r=>r.status==='待修正').length};
 if(body.mode==='preview')return {rows:results,summary};
 if(summary.invalid)throw new AllocationError('存在待修正行，本批未写入。请修正后重新预览');
 if(!prepared.length)return {inserted:0,skipped:summary.skipped,total:summary.total};
 const time=now(),token=id(),payload=JSON.stringify(prepared);
 if(new TextEncoder().encode(payload).byteLength>1_900_000)throw new AllocationError('转换后的内容超过本批容量，请减少项目数量后重新预览');
 const batch=await db.batch([
  db.prepare("INSERT INTO crm_followup_orders(id,order_number,project,lead_id,commercial_id,logistics_id,stage,details,steps,change_token,created,created_by,updated,updated_by) SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.order_number'),json_extract(j.value,'$.project'),json_extract(j.value,'$.lead_id'),json_extract(j.value,'$.commercial_id'),json_extract(j.value,'$.logistics_id'),json_extract(j.value,'$.stage'),json_extract(j.value,'$.details'),json_extract(j.value,'$.steps'),?,?,?, ?,? FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM crm_followup_orders o WHERE lower(trim(o.order_number))=lower(trim(json_extract(j.value,'$.order_number'))))").bind(token,time,actor.id,time,actor.id,payload),
  db.prepare("INSERT INTO crm_followup_events(id,order_id,kind,payload,created,created_by) SELECT json_extract(j.value,'$.id')||'-import',o.id,'历史项目导入',json_object('filename',?,'data_index',json_extract(j.value,'$.data_index'),'current_stage',o.stage,'history_note',json_extract(o.details,'$.history_note'),'notice','只记录当前阶段，未自动完成之前阶段或归档'),?,? FROM json_each(?) j JOIN crm_followup_orders o ON o.id=json_extract(j.value,'$.id') AND o.change_token=?").bind(filename,time,actor.id,payload,token)
 ]);
 const inserted=batch[0].meta.changes;
 return {inserted,skipped:summary.total-inserted,total:summary.total};
}
