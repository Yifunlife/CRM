import {authorizedLead,can,digest,now} from './crm';
import {customerLeadSQL} from './contact-kind';
import {meetingRecordsSQL,VISIT_IMPORT_LIMIT} from './customer-meetings';
import {AllocationError} from './allocation-server';
const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
export async function importVisits(db:D1Database,user:any,actor:any,body:any){
 if(!can(user,'customers_edit'))fail('没有到访记录导入权限',403);
 if(!['preview','import'].includes(body.mode)||!Array.isArray(body.rows)||!body.rows.length||body.rows.length>VISIT_IMPORT_LIMIT)fail(`每批请选择1至${VISIT_IMPORT_LIMIT}条到访记录`);
 const filename=typeof body.filename==='string'?body.filename.slice(0,200):'';
 const rows:any[]=[],statements:D1PreparedStatement[]=[],seen=new Set<string>(),timestamp=now();
 for(const [index,raw] of body.rows.entries()){
  const errors:string[]=[];
  const value=(key:string,max=2000)=>{const v=raw?.[key];if(v===undefined)return '';if(typeof v!=='string'||v.trim().length>max){errors.push(key+'内容无效或过长');return '';}return v.trim();};
  const leadId=value('lead_id',100),name=value('customer_name',200),payload={type:'到访公司',date:value('date',10),participants:value('participants',500),result:value('result'),next_action:value('next_action'),source:'到访表单导入',filename};
  if(!/^\d{4}-\d\d-\d\d$/.test(payload.date)||!Number.isFinite(Date.parse(payload.date))||new Date(payload.date).toISOString().slice(0,10)!==payload.date)errors.push('到访日期须为有效的YYYY-MM-DD');
  if(!payload.participants||!payload.result||!payload.next_action)errors.push('请补齐参与人、到访结论与下一步行动');
  if(!leadId&&!name)errors.push('请填写CRM客户ID或客户名称');
  const matches=leadId||name?(await db.prepare(`SELECT l.id,l.name,l.owner_id FROM crm_leads l WHERE ${customerLeadSQL()} AND ${can(user,'customers_all')?'1=1':'l.owner_id=?'} AND ${leadId?'l.id=?':'l.name=?'} LIMIT 2`).bind(...(can(user,'customers_all')?[]:[user.id]),leadId||name).all<any>()).results:[];
  const lead=matches.length===1?matches[0]:null;
  if(!lead||!authorizedLead(user,lead))errors.push(matches.length>1?'客户名称重复，请填写CRM客户ID':'客户未匹配或无权查看，请核对CRM客户ID');
  if(lead&&name&&lead.name!==name)errors.push('CRM客户ID与客户名称不一致');
  let duplicate=false;
  if(!errors.length){
   const signature=await digest(JSON.stringify([lead.id,payload.type,payload.date,payload.participants,payload.result,payload.next_action]));
   const key='visit:'+signature;
   const existing=await db.prepare(`SELECT id FROM (${meetingRecordsSQL}) WHERE lead_id=? AND json_extract(payload,'$.type')=? AND json_extract(payload,'$.date')=? AND json_extract(payload,'$.participants')=? AND json_extract(payload,'$.result')=? AND json_extract(payload,'$.next_action')=? LIMIT 1`).bind(lead.id,payload.type,payload.date,payload.participants,payload.result,payload.next_action).first();
   duplicate=seen.has(key)||!!existing;seen.add(key);
   if(!duplicate)statements.push(db.prepare(`INSERT OR IGNORE INTO crm_sales_events(id,lead_id,kind,payload,occurred_at,created,created_by) SELECT ?,?,'客户会议与到访',?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_leads l WHERE l.id=? AND l.owner_id IS ? AND ${customerLeadSQL()})`).bind(key,lead.id,JSON.stringify(payload),payload.date+'T00:00:00+08:00',timestamp,actor.id,lead.id,lead.owner_id));
  }
  rows.push({row:index+1,customer_name:lead?.name||name,date:payload.date,participants:payload.participants,result:payload.result,next_action:payload.next_action,status:errors.length?'待修正':duplicate?'跳过重复':'可导入',errors});
 }
 const summary={total:rows.length,ready:rows.filter(r=>r.status==='可导入').length,skipped:rows.filter(r=>r.status==='跳过重复').length,invalid:rows.filter(r=>r.status==='待修正').length};
 if(body.mode==='preview')return {rows,summary};
 if(summary.invalid)fail('本批未导入，请先修正预览中的问题');
 const results=statements.length?await db.batch(statements):[];
 const inserted=results.reduce((n,r)=>n+Number(r.meta.changes||0),0);
 return {inserted,skipped:summary.skipped,not_inserted:summary.ready-inserted};
}
