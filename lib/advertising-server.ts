import {AD_ACCOUNT_PLATFORMS} from './operations';
import {AD_PLATFORMS,AD_STATUSES,type AdPlatform} from './advertising';
import {id,now,clean} from './crm';
import {AllocationError} from './allocation-server';
export async function advertisingEndpoint(db:D1Database,user:any,path:string,method:string,body:any){
 if(path!=='advertising')return undefined;
 if(!['admin','operations'].includes(user.role))throw new AllocationError('广告投放需要运营或管理员权限',403);
 if(method==='GET')return (await db.prepare('SELECT a.*,u.name AS owner_name FROM crm_advertising a JOIN crm_users u ON u.id=a.owner_id ORDER BY a.date DESC,a.created DESC').all()).results;
 if(!['POST','PATCH'].includes(method))throw new AllocationError('操作不存在',404);
 const platform=clean(body.platform,40) as AdPlatform,name=clean(body.name,200),date=clean(body.date,10),status=clean(body.status,20);
 if(!Object.hasOwn(AD_PLATFORMS,platform)||!name||!AD_STATUSES.includes(status))throw new AllocationError('请填写广告名称并选择平台和进度');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new AllocationError('请填写有效的投放日期');
 function amount(value:unknown){const text=String(value??'').trim();if(!/^\d{1,10}(\.\d{1,2})?$/.test(text))throw new AllocationError('金额须为非负数，最多两位小数');return Math.round(Number(text)*100);}
 const budget=amount(body.budget),spent=amount(body.spent),owner=clean(body.owner_id,80),notes=clean(body.notes),time=now();
 if(!await db.prepare("SELECT id FROM crm_users WHERE id=? AND active=1 AND role IN ('admin','operations')").bind(owner).first())throw new AllocationError('请选择有效的运营或管理员负责人');
 const previous:any=method==='PATCH'?await db.prepare('SELECT platform,account_id FROM crm_advertising WHERE id=?').bind(body.id).first():null;
 const accountId=body.account_id===undefined?(previous?.account_id||null):(clean(body.account_id,80)||null);
 if(accountId){const account:any=await db.prepare('SELECT platform,currency,active FROM crm_operation_accounts WHERE id=?').bind(accountId).first();if(!account||(!account.active&&previous?.account_id!==accountId)||account.currency!==AD_PLATFORMS[platform]||!AD_ACCOUNT_PLATFORMS[platform].includes(account.platform))throw new AllocationError('请选择与投放平台对应的已启用运营账号');}
 if(method==='PATCH'){
  const existing=previous;
  if(!existing)throw new AllocationError('广告记录不存在',404);
  if(AD_PLATFORMS[existing.platform as AdPlatform]!==AD_PLATFORMS[platform])throw new AllocationError('不能更改已保存记录的币种，请新建另一条投放记录');
  await db.prepare('UPDATE crm_advertising SET account_id=?,name=?,platform=?,date=?,status=?,owner_id=?,budget=?,spent=?,notes=?,updated=?,updated_by=? WHERE id=?').bind(accountId,name,platform,date,status,owner,budget,spent,notes,time,user.id,body.id).run();
 }else await db.prepare('INSERT INTO crm_advertising(id,account_id,name,platform,currency,date,status,owner_id,budget,spent,notes,created,created_by,updated,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id(),accountId,name,platform,AD_PLATFORMS[platform],date,status,owner,budget,spent,notes,time,user.id,time,user.id).run();
 return {ok:true};
}
