import {OP_PLATFORMS,type OpPlatform,opToday} from './operations';
import {id,now,clean} from './crm';
import {AllocationError} from './allocation-server';
export async function operationsEndpoint(db:D1Database,user:any,path:string,method:string,body:any){
 if(!['operations/accounts','operations/daily'].includes(path))return undefined;
 if(!['admin','operations'].includes(user.role))throw new AllocationError('需要运营或管理员权限',403);
 const accounts=path==='operations/accounts';
 if(method==='GET')return (await db.prepare(accounts?'SELECT a.*,u.name AS owner_name FROM crm_operation_accounts a JOIN crm_users u ON u.id=a.owner_id ORDER BY a.platform,a.name':'SELECT d.*,a.name AS account_name,a.platform,a.currency,u.name AS updated_by_name FROM crm_operation_daily d JOIN crm_operation_accounts a ON a.id=d.account_id JOIN crm_users u ON u.id=d.updated_by ORDER BY d.date DESC,d.updated DESC').all()).results;
 if(!['POST','PATCH'].includes(method))throw new AllocationError('操作不存在',404);
 const table=accounts?'crm_operation_accounts':'crm_operation_daily',existing:any=method==='PATCH'?await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(clean(body.id,80)).first():null;
 if(method==='PATCH'&&!existing)throw new AllocationError('记录不存在',404);
 if(existing&&Number(body.version)!==existing.version)throw new AllocationError('记录已被更新，请刷新后重新编辑',409);
 const time=now(),recordId=existing?.id||id();
 async function save(sql:string,values:any[]){const result=await db.prepare(sql).bind(...values).run();if(existing&&result.meta.changes!==1)throw new AllocationError('记录已被更新，请刷新后重新编辑',409);return {ok:true,id:recordId};}
 if(accounts){
  const name=clean(body.name,100),platform=clean(body.platform,40) as OpPlatform,owner=clean(body.owner_id,80),accountRef=clean(body.account_ref,200),notes=clean(body.notes);
  if(!name||!Object.hasOwn(OP_PLATFORMS,platform))throw new AllocationError('请填写运营账号名称并选择平台');
  if(existing&&existing.platform!==platform)throw new AllocationError('已保存账号不能更换平台，请新建另一个账号');
  if(!await db.prepare("SELECT id FROM crm_users WHERE id=? AND active=1 AND role IN ('admin','operations')").bind(owner).first())throw new AllocationError('请选择有效的运营负责人');
  if(await db.prepare('SELECT id FROM crm_operation_accounts WHERE platform=? AND name=? AND id<>?').bind(platform,name,recordId).first())throw new AllocationError('此平台已有同名运营账号，请使用已有账号');
  const active=body.active===undefined?1:Number(body.active);if(![0,1].includes(active))throw new AllocationError('账号状态无效');
  if(existing)return save('UPDATE crm_operation_accounts SET name=?,account_ref=?,owner_id=?,notes=?,active=?,updated=?,updated_by=?,version=version+1 WHERE id=? AND version=?',[name,accountRef,owner,notes,active,time,user.id,recordId,existing.version]);
  return save('INSERT INTO crm_operation_accounts(id,name,platform,currency,account_ref,owner_id,notes,active,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[recordId,name,platform,OP_PLATFORMS[platform],accountRef,owner,notes,active,time,user.id,time,user.id]);
 }
 const accountId=clean(body.account_id,80),date=clean(body.date,10),status=clean(body.status,10),notes=clean(body.notes);
 const account:any=await db.prepare('SELECT * FROM crm_operation_accounts WHERE id=?').bind(accountId).first();
 if(!account||!account.active&&existing?.account_id!==accountId)throw new AllocationError('请选择有效的运营账号');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>opToday())throw new AllocationError('请选择有效日期，每日实绩不能填写未来日期');
 if(existing&&(existing.account_id!==accountId||existing.date!==date))throw new AllocationError('修改时不能更换账号或日期；请作废原记录后填写正确记录');
 if(!['有效','作废'].includes(status))throw new AllocationError('记录状态无效');
 if(status==='作废'&&!notes)throw new AllocationError('请在备注中填写作废原因');
 function integer(value:unknown,signed=false){const s=String(value??'');if(!(signed?/^-?\d{1,9}$/:/^\d{1,9}$/).test(s))throw new AllocationError('粉丝和发布数量须为整数，只有净增粉丝可填负数');return Number(s);}
 function amount(value:unknown){const s=String(value??'');if(!/^\d{1,10}(\.\d{1,2})?$/.test(s))throw new AllocationError('金额须为非负数，最多两位小数');return Math.round(Number(s)*100);}
 const total=integer(body.followers_total),change=integer(body.followers_change,true),posts=integer(body.posts),ad=amount(body.ad_spend),other=amount(body.other_spend),revenue=amount(body.revenue);
 if(change>total)throw new AllocationError('当天净增粉丝不能超过日末总粉丝');
 if(existing)return save('UPDATE crm_operation_daily SET followers_total=?,followers_change=?,posts=?,ad_spend=?,other_spend=?,revenue=?,notes=?,status=?,updated=?,updated_by=?,version=version+1 WHERE id=? AND version=?',[total,change,posts,ad,other,revenue,notes,status,time,user.id,recordId,existing.version]);
 if(await db.prepare('SELECT id FROM crm_operation_daily WHERE account_id=? AND date=?').bind(accountId,date).first())throw new AllocationError('该账号当天已有记录，请在记录列表中编辑，避免重复统计',409);
 return save('INSERT INTO crm_operation_daily(id,account_id,date,followers_total,followers_change,posts,ad_spend,other_spend,revenue,notes,status,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[recordId,accountId,date,total,change,posts,ad,other,revenue,notes,status,time,user.id,time,user.id]);
}
