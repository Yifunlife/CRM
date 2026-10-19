'use client';
import {useState} from 'react';

export default function EmployeeLogin({users,save}:{users:any[];save:(accounts:any[])=>Promise<void>}){
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 const accounts:any[]=[],issues:string[]=[];
 for(const line of lines){
  const [name,code,...extra]=line.split(/[\s,，]+/),matches=users.filter(u=>u.name===name);
  if(extra.length||!/^YW\d{3}$/.test(code||'')||matches.length!==1){issues.push(line+'：请核对姓名和工号');continue;}
  const user=matches[0];
  if(accounts.some(a=>a.id===user.id||a.employee_number===code)){issues.push(line+'：姓名或工号重复');continue;}
  if(user.username===code.toLowerCase()){issues.push(line+'：已使用该工号，不重复重置');continue;}
  accounts.push({id:user.id,name:user.name,previous_username:user.username,employee_number:code});
 }
 return <details className="panel"><summary>批量设置工号登录</summary><p className="small muted">每行填写“现有账号姓名 工号”，例如“方总 YW001”。仅更新列出的账号，登录用户名和初始密码均设为工号，原登录会失效。客户归属、权限和历史记录不变。</p><label>姓名与工号<textarea value={text} onChange={e=>setText(e.target.value)} placeholder="每行一个账号，工号使用大写 YW 和三位数字" rows={5}/></label>{accounts.length>0&&<p className="small">将更新：{accounts.map(a=>a.name+'（'+a.employee_number+'）').join('、')}</p>}{issues.map((issue,i)=><p className="error" key={i}>{issue}</p>)}{error&&<p className="error">{error}</p>}<button className="primary" disabled={busy||!accounts.length||!!issues.length} onClick={async()=>{setBusy(true);setError('');try{await save(accounts);setText('');}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>{busy?'正在设置…':`设置 ${accounts.length} 个账号的工号及初始密码`}</button></details>;
}
