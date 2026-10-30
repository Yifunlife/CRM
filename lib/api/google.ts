import { clean } from '../crm';
import { connection,GOOGLE_SHEET_ID,previewGoogle,seal,startGoogle } from '../google';
import { syncGoogleForms } from '../google-form-sync';
import type { ApiContext } from './context';
import { json,Problem } from './http';
export async function googleConnection({db,env,req,url,path,write,body,user,actor}:ApiContext):Promise<Response|undefined>{
  if (path.startsWith("google/")) {
   if(user.role!=="admin"&&!(user.role==='ceo'&&path==='google/status'&&!write))throw new Problem("只有管理员可以配置Google连接",403);
   const secret=(env as any).GOOGLE_TOKEN_KEY;
   if(path==='google/forms/preview'&&req.method==='POST')return json(await syncGoogleForms(db,{manual:true,preview:true,actor:actor.id}));
   if(path==='google/forms/run'&&req.method==='POST')return json(await syncGoogleForms(db,{manual:true,actor:actor.id}));
   if(path==='google/forms/config'&&req.method==='POST'){
    if(user.id!==actor.id||typeof body.enabled!=='boolean')throw new Problem('请使用本人管理员账号设置每日抓取',403);
    await db.prepare("INSERT INTO crm_google_form_sync(id,enabled,actor_id) VALUES('main',?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,actor_id=excluded.actor_id").bind(body.enabled?1:0,actor.id).run();return json({ok:true});
   }
   if(path==="google/status"&&!write){const c=await connection(db);return json({configured:!!(c?.client_id&&c.client_secret&&secret),client_id:c?.client_id||"",connected:!!c?.refresh_token,email:c?.email||"",connected_at:c?.connected||"",checked:c?.checked||"",sheet_id:GOOGLE_SHEET_ID,callback_url:url.origin+"/api/google/callback",last_error:c?.last_error||"",protected:!!secret,form_sync:await db.prepare("SELECT enabled,last_cutoff,finished,last_error,result FROM crm_google_form_sync WHERE id='main'").first()});}
   if(path==="google/config"&&req.method==="POST"){
    if(!secret)throw new Problem("服务器凭证保护尚未配置",503);
    const clientId=clean(body.client_id,300),clientSecret=clean(body.client_secret,2000);
    if(!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId)||!clientSecret)throw new Problem("请填写Google OAuth客户端ID和客户端密钥");
    await db.batch([db.prepare("INSERT INTO crm_google_connection(id,client_id,client_secret) VALUES('main',?,?) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,client_secret=excluded.client_secret,refresh_token='',email='',connected='',checked='',last_error=''").bind(clientId,await seal(clientSecret,secret)),db.prepare("DELETE FROM crm_google_oauth")]);return json({ok:true});
   }
   if(path==="google/start"&&req.method==="POST"){try{const r=await startGoogle(db,env,user.id,url.origin);return json({url:r.url},200,{"Set-Cookie":r.cookie});}catch(e:any){throw new Problem(e.message);}}
   if(path==="google/preview"&&req.method==="POST"){try{return json(await previewGoogle(db,env));}catch(e:any){const message=e.name==='TimeoutError'?'Google连接超时，请稍后重试':e.message;await db.prepare("UPDATE crm_google_connection SET last_error=? WHERE id='main'").bind(clean(message,200)).run();throw new Problem(message);}}
   if(path==="google/disconnect"&&req.method==="POST"){await db.batch([db.prepare("UPDATE crm_google_connection SET refresh_token='',email='',connected='',checked='',last_error='' WHERE id='main'"),db.prepare("DELETE FROM crm_google_oauth")]);return json({ok:true});}
  }
}
