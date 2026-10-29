import {parseCSV} from './import-grid';
import {GOOGLE_SHEET_ID} from './google';
import {formRow,importForms} from './form-intake';
import {now} from './crm';

export const FORM_SHEETS=[['1463131448','【全案客资】-逻辑筛选-copy'],['2087725216','【全案客资】多个单选-含国家'],['913270812','【场景客资】多个单选-含国家'],['1654864607','玩具号客资-增加公司名']];
export async function readPublicForms(){
 const sheets=await Promise.all(FORM_SHEETS.map(async([gid,name])=>{
  const response=await fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${gid}`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Google表格无法读取，请检查原表的只读访问权限');
  const text=await response.text();if(text.length>15000000)throw new Error('Google工作表超过读取限制');
  const [headers,...values]=parseCSV(text.replace(/^\uFEFF/,''));
  if(!headers||!['id','created_time','form_id','full_name','work_email','work_phone_number'].every(k=>headers.includes(k)))throw new Error('Google表格字段不完整或访问权限已变化，本批没有入库');
  if(new Set(headers).size!==headers.length)throw new Error('Google表格有重复列名，请核查');
  return values.map((r,i)=>({...Object.fromEntries(headers.map((h,j)=>[h,r[j]||''])),_sheet:name,_row:String(i+2)}));
 }));
 return sheets.flat();
}
export function sydneyCutoff(at:string){
 const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(at));
 let wall=Date.parse(parts.slice(0,10)+'T08:00:00Z');if(Number(parts.slice(11,13))<8)wall-=86400000;
 let instant=wall;for(let i=0;i<3;i++){const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(instant));instant+=wall-Date.parse(local.replace(' ','T')+'Z');}
 return new Date(instant).toISOString();
}
export async function syncGoogleForms(db:D1Database,options:{at?:string;manual?:boolean;preview?:boolean;actor?:string;rows?:any[]}={}){
 const at=options.at||now(),cutoff=sydneyCutoff(at),config=await db.prepare("SELECT * FROM crm_google_form_sync WHERE id='main'").first<any>();
 if(!options.manual&&(!config?.enabled||new Intl.DateTimeFormat('en-GB',{timeZone:'Australia/Sydney',hour:'2-digit',hourCycle:'h23'}).format(new Date(at))!=='08'||config.last_cutoff>=cutoff))return {skipped:true};
 const actor=options.actor||config?.actor_id;if(!actor)throw new Error('尚未设置表单同步执行账号');
 try{
  const all=options.rows||await readPublicForms();
  // Re-scan all history every morning; persisted source IDs catch late arrivals without reprocessing old submissions.
  const rows=all.filter(r=>Date.parse(formRow(r).occurred)<Date.parse(cutoff));
  const result=await importForms(db,rows,actor,{preview:options.preview,filename:'Google表单｜截止 '+cutoff});
  if(!options.preview)await db.prepare("UPDATE crm_google_form_sync SET last_cutoff=?,finished=?,last_error='',result=? WHERE id='main'").bind(cutoff,at,JSON.stringify({...result,groups:undefined}),).run();
  return {...result,cutoff,total:all.length,eligible:rows.length,deferred:all.length-rows.length};
 }catch(error:any){if(!options.preview)await db.prepare("UPDATE crm_google_form_sync SET last_error=? WHERE id='main'").bind(String(error.message).slice(0,300)).run();throw error;}
}
