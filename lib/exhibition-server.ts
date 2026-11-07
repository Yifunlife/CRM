import {can,id,now} from './crm';
import {Problem} from './api/http';
import {EXHIBITION_CATEGORIES,EXHIBITION_KINDS,TRAVEL_TYPES,newExhibition,exhibitionTotals,exhibitionReminders,type ExhibitionData,type ExhibitionKind} from './exhibitions';
const all=async(db:any,q:string,...args:any[])=>(await db.prepare(q).bind(...args).all()).results||[];
export const canManageExhibitions=(u:any)=>['admin','ceo','management'].includes(u?.role)&&can(u,'customers_all');
const text=(v:any,max=2000)=>{if(v===undefined||v===null)return '';if(typeof v!=='string'||v.length>max)throw new Problem('文字格式不正确或内容过长');return v.trim();};
const date=(v:any)=>{if(!v)return '';const s=text(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw new Problem('请填写有效日期');return s;};
const number=(v:any,label:string,optional=false)=>{if(optional&&(v===''||v===null||v===undefined))return null;const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e12)throw new Problem(label+'需为有效非负数字');return n;};
function cleanShow(r:any){const d:any={};for(const k of ['name','location','booth','notes','owner_id','status'])d[k]=text(r[k],k==='notes'?5000:300);for(const k of ['start','end','design_due','logistics_due'])d[k]=date(r[k]);d.area=number(r.area,'展位面积',true);d.budget_minor=number(r.budget_minor??0,'预算');d.year_pending=r.year_pending===true;if(!d.name||!d.start||!d.end)throw new Problem('请填写展会名称和起止日期');if(d.start<'2026-11-01'||d.end<d.start)throw new Problem('展会日期需在2026年11月起，结束日不能早于开始日');return d;}
const fields:Record<ExhibitionKind,string[]>={
 tasks:['name','department','owner_id','status','notes','followup_log','start','end','due','next_followup','reminders'],
 suppliers:['name','type','company','contact','phone','owner_id','status','notes','followup_log','next_followup','quote_minor','currency','pickup','departure','arrival','customs','delivery','tracking','route','design_due','entry','acceptance','dismantle','requirements','reminders'],
 equipment:['name','spec','quantity','unit','department','owner_id','status','start','end','due','next_followup','notes','followup_log','reminders'],
 items:['name','spec','quantity','unit','department','owner_id','due','next_followup','notes','followup_log','equipment_id','reminders'],
 expenses:['name','source_id','category','subtype','date','currency','amount_minor','fx','paid_minor','owner_id','notes'],
 income:['name','equipment_id','quantity','buyer','contact','date','currency','amount_minor','fx','paid_minor','receipt_date','delivery_date','delivery_status','address','signoff','next_followup','owner_id','proof','notes','followup_log','status','reminders'],
 customers:['lead_id','relation','owner_id','next_followup','notes','followup_log','status','reminders'],deals:['deal_id','notes']
};
function cleanRecord(kind:ExhibitionKind,r:any,existing:any){const out:any={id:text(r.id,100)};if(!/^[\w-]{1,100}$/.test(out.id))throw new Problem('记录标识无效');for(const k of fields[kind]){const v=r[k];if(k==='reminders'){if(v!==undefined&&(!Array.isArray(v)||v.some((n:any)=>![1,3,7].includes(n))))throw new Problem('提醒日请选择提前7、3、1天');out[k]=v??[7,3,1];}else if(['quantity','quote_minor','amount_minor','paid_minor','fx'].includes(k)){out[k]=number(v??(k==='fx'?1:['amount_minor','paid_minor','quote_minor'].includes(k)?0:null),k,true);if(['amount_minor','paid_minor','quote_minor'].includes(k)&&out[k]!==null&&!Number.isSafeInteger(out[k]))throw new Problem('金额精确到分');if(k==='quantity'&&out[k]!==null&&!Number.isSafeInteger(out[k]))throw new Problem('数量需为整数');}else if(['start','end','due','next_followup','date','receipt_date','delivery_date','pickup','departure','arrival','customs','delivery','design_due','entry','acceptance','dismantle'].includes(k))out[k]=date(v);else out[k]=text(v,k==='notes'||k==='followup_log'?5000:500);}
 if(kind==='items')Object.assign(out,{confirmed:existing?.confirmed||false,confirmed_by:existing?.confirmed_by||'',confirmed_at:existing?.confirmed_at||''});
 if(!['customers','deals'].includes(kind)&&!out.name)throw new Problem('请填写名称');
 if(out.start&&out.end&&out.end<out.start)throw new Problem('结束日不能早于开始日');
 if(['expenses','income'].includes(kind)){if(!out.date||!['CNY','USD','EUR','GBP','AED','JPY','AUD','HKD','RUB','SAR'].includes(out.currency))throw new Problem('请选择日期和币种');if(!(out.fx>0)||out.currency==='CNY'&&out.fx!==1)throw new Problem('请填写有效汇率；人民币汇率为1');if(out.amount_minor===null||out.paid_minor===null||out.paid_minor>out.amount_minor)throw new Problem('已付或已收金额不能超过发生金额');if(kind==='expenses'&&(!EXHIBITION_CATEGORIES.includes(out.category)||out.category==='出行费'&&!TRAVEL_TYPES.includes(out.subtype)))throw new Problem('请选择费用类别和出行费明细');if(kind==='income'&&(!out.buyer||!(out.quantity>0)))throw new Problem('请填写买方和出售数量');}
 if(kind==='suppliers'&&!['物流方','搭建方'].includes(out.type))throw new Problem('请选择物流方或搭建方');
 return out;
}
async function validateDocument(db:any,d:ExhibitionData){
 const owners=new Set((await all(db,"SELECT id FROM crm_users WHERE active=1 AND role IN ('admin','ceo','management')")).map((u:any)=>u.id));
 for(const r of [d,...EXHIBITION_KINDS.flatMap(k=>d[k])])if(r.owner_id&&!owners.has(r.owner_id)){// Historical assignments remain visible after a colleague leaves, but cannot be newly chosen.
  const historical=await db.prepare('SELECT data FROM crm_exhibitions WHERE id=?').bind(d._id||'').first();const old=historical?JSON.parse(historical.data):null;const prior=r===d?old:old&&EXHIBITION_KINDS.flatMap(k=>old[k]).find((x:any)=>x.id===r.id);if(prior?.owner_id!==r.owner_id)throw new Problem('负责人需选择当前在职管理层人员');
 }
 const sources=new Set(['booth',...['tasks','suppliers','equipment','items'].flatMap(k=>d[k].map((r:any)=>r.id))]);
 for(const r of d.items)if(r.equipment_id&&!d.equipment.some((e:any)=>e.id===r.equipment_id))throw new Problem('关联设备不属于当前展会');
 for(const r of d.expenses){if(r.source_id&&!sources.has(r.source_id))throw new Problem('费用关联事项不属于当前展会');if(d.items.some((i:any)=>i.id===r.source_id&&i.equipment_id))throw new Problem('互动设备费用请关联自制设备，避免重复计费');}
 for(const e of d.equipment){const qty=d.income.filter((r:any)=>r.equipment_id===e.id).reduce((n:number,r:any)=>n+r.quantity,0);if(qty&&(e.quantity===null||e.quantity===undefined||qty>e.quantity))throw new Problem('出售数量超过设备数量，请先核实自制设备资料');}
 for(const r of d.income)if(!d.equipment.some((e:any)=>e.id===r.equipment_id))throw new Problem('请选择本展会出售的设备');
 for(const r of d.customers)if(!r.lead_id||!await db.prepare('SELECT id FROM crm_leads WHERE id=?').bind(r.lead_id).first())throw new Problem('关联客户不存在');
 if(new Set(d.customers.map((r:any)=>r.lead_id)).size!==d.customers.length)throw new Problem('该客户已关联本展会');
 for(const r of d.deals){const deal=await db.prepare('SELECT lead_id FROM crm_deals WHERE id=? AND cancelled=0').bind(r.deal_id).first();if(!deal)throw new Problem('请选择有效成交订单');if(!d.customers.some((c:any)=>c.lead_id===deal.lead_id))throw new Problem('请先关联该订单的客户');}
 if(new Set(d.deals.map((r:any)=>r.deal_id)).size!==d.deals.length)throw new Problem('该订单已关联本展会');
}
export async function exhibitionEndpoint(db:any,user:any,actor:any,path:string,method:string,body:any={},url=new URL('https://crm.test')):Promise<any>{
 if(path!=='exhibitions'&&!path.startsWith('exhibitions/'))return undefined;
 if(!canManageExhibitions(user)||!canManageExhibitions(actor))throw new Problem('展会管理仅供公司管理层使用',403);
 if(method==='GET'&&path==='exhibitions/search'){const q=text(url.searchParams.get('q'),100),kind=url.searchParams.get('kind');if(q.length<2)return {items:[]};const like='%'+q.replace(/[\\%_]/g,'\\$&')+'%';return {items:kind==='deals'?await all(db,"SELECT d.id,d.order_number AS name,l.name AS customer,d.lead_id,a.exhibition_id FROM crm_deals d JOIN crm_leads l ON l.id=d.lead_id LEFT JOIN crm_exhibition_deals a ON a.deal_id=d.id WHERE d.cancelled=0 AND (d.order_number LIKE ? ESCAPE '\\' OR l.name LIKE ? ESCAPE '\\') ORDER BY d.deal_date DESC LIMIT 30",like,like):await all(db,"SELECT id,name,country,source FROM crm_leads WHERE name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' ORDER BY created DESC LIMIT 30",like,like,like)};}
 if(method==='GET'&&path==='exhibitions'){
  const owners=await all(db,"SELECT id,name,role FROM crm_users WHERE active=1 AND role IN ('admin','ceo','management') ORDER BY name");
  const rows=await all(db,'SELECT * FROM crm_exhibitions ORDER BY json_extract(data,\'$.start\'),id');
  const linked=await all(db,"SELECT a.exhibition_id,d.id,d.lead_id,d.order_number,d.deal_date,d.cancelled,c.currency,c.total_minor,COALESCE((SELECT SUM(r.amount_minor-COALESCE((SELECT SUM(f.amount_minor) FROM crm_workflow_refunds f WHERE f.receipt_id=r.id),0)) FROM crm_receipts r WHERE r.deal_id=d.id AND r.cancelled=0 AND r.currency=c.currency),0) AS received_minor FROM crm_exhibition_deals a JOIN crm_deals d ON d.id=a.deal_id LEFT JOIN crm_workflow_contracts c ON c.deal_id=d.id");
  const customerIds=rows.flatMap((r:any)=>JSON.parse(r.data).customers.map((c:any)=>c.lead_id));
  const customers=[];for(let i=0;i<customerIds.length;i+=80)customers.push(...await all(db,'SELECT id,name,country,source,status FROM crm_leads WHERE id IN ('+customerIds.slice(i,i+80).map(()=>'?').join(',')+')',...customerIds.slice(i,i+80)));
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Sydney'});
  return {can_edit:true,current_user_id:user.id,owners,customers,deals:linked,today,shows:rows.map((r:any)=>{const data=JSON.parse(r.data);return {id:r.id,version:r.version,data,totals:exhibitionTotals(data),reminders:exhibitionReminders(data,today)};})};
 }
 if(method!=='POST'||!['exhibitions/create','exhibitions/save'].includes(path))throw new Problem('操作不存在',404);
 const at=now();
 if(path==='exhibitions/create'){const d=newExhibition(cleanShow(body.record||{})),key=id();await validateDocument(db,d);await db.batch([db.prepare('INSERT INTO crm_exhibitions(id,data,created,updated,updated_by) VALUES(?,?,?,?,?)').bind(key,JSON.stringify(d),at,at,actor.id),db.prepare('INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) VALUES(?,?,?,?,?,?)').bind(id(),'新建展会',key,JSON.stringify(d),at,actor.id)]);return {id:key};}
 const row=await db.prepare('SELECT * FROM crm_exhibitions WHERE id=?').bind(text(body.id,100)).first();if(!row)throw new Problem('展会不存在',404);if(row.version!==body.version)throw new Problem('展会已被更新，已刷新最新资料；请核对后再次保存',409);
 const d:ExhibitionData=JSON.parse(row.data);d._id=row.id;const kind=body.kind as ExhibitionKind;
 if(body.kind==='show')Object.assign(d,cleanShow(body.record||{}));
 else if(body.kind==='confirm'){const item=d.items.find((r:any)=>r.id===body.record?.id);if(!item||typeof body.record.confirmed!=='boolean')throw new Problem('清单项目不存在');Object.assign(item,{confirmed:body.record.confirmed,confirmed_by:body.record.confirmed?actor.id:'',confirmed_at:body.record.confirmed?at:''});}
 else {if(!EXHIBITION_KINDS.includes(kind)||!body.record)throw new Problem('记录类别不正确');const index=d[kind].findIndex((r:any)=>r.id===body.record.id),record=cleanRecord(kind,body.record,index>=0?d[kind][index]:null);if(index<0){if(d[kind].length>=500)throw new Problem('单场展会此类记录已达500项');d[kind].push(record);}else d[kind][index]=record;}
 await validateDocument(db,d);delete d._id;
 const statements=[db.prepare('UPDATE crm_exhibitions SET data=?,version=CASE WHEN version=? THEN version+1 ELSE NULL END,updated=?,updated_by=? WHERE id=?').bind(JSON.stringify(d),body.version,at,actor.id,row.id),db.prepare('DELETE FROM crm_exhibition_deals WHERE exhibition_id=?').bind(row.id),...d.deals.map((r:any)=>db.prepare('INSERT INTO crm_exhibition_deals(deal_id,exhibition_id) VALUES(?,?)').bind(r.deal_id,row.id)),db.prepare('INSERT INTO crm_workflow_audit(id,kind,entity_id,payload,created,created_by) VALUES(?,?,?,?,?,?)').bind(id(),'展会管理更新',row.id,JSON.stringify({kind:body.kind,before:JSON.parse(row.data),after:d}),at,actor.id)];
 try{await db.batch(statements);}catch(e:any){if(/UNIQUE constraint failed.*crm_exhibition_deals|crm_exhibition_deals.deal_id/.test(String(e)))throw new Problem('该成交订单已归属其他展会，不能重复统计',409);if(/NOT NULL constraint.*version/.test(String(e)))throw new Problem('展会已被更新，请刷新核对后再次保存',409);throw e;}
 return {id:row.id,version:row.version+1};
}
