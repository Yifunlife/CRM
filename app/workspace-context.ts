export function workspaceContextKey(user:any){return [user.id,user.role,user.personal_business?'personal':'company',user.role_preview?.context_id||''].join(':');}
export function readWorkspaceContext(key:string){try{return JSON.parse(sessionStorage.getItem('crm-workspace:'+key)||'{}');}catch{return {};}}
export function writeWorkspaceContext(key:string,value:any){try{sessionStorage.setItem('crm-workspace:'+key,JSON.stringify(value));}catch{}}
