export const ACCOUNT_ROLES:Record<string,string>={admin:'管理员',ceo:'CEO',management:'管理层',sales:'业务员',followup:'跟单员',operations:'运营（原有角色）'};
export const TRADE_SCOPES={domestic:'内贸',foreign:'外贸'} as const;
// Confirmed sales attribution; customer ownership and source records stay unchanged.
export function accountSalesCompany(user:{id:string}){
 return ['b7e34925-ec83-4f4e-ad42-04be344dc82b','33e3947e-976c-4521-8128-7a18e60ed462'].includes(user.id)?'澳洲分公司':'';
}
export function accountTradeScopes(user:any):string[]{
 const value=typeof user.trade_scopes==='string'?JSON.parse(user.trade_scopes):user.trade_scopes;
 return Array.isArray(value)?value.filter(v=>v in TRADE_SCOPES):[];
}
export function accountList(users:any[],status:string,role:string,query:string){
 const order=Object.keys(ACCOUNT_ROLES),search=query.trim().toLowerCase();
 return users.filter(u=>String(u.active)===status&&(!role||u.role===role)&&(!search||[u.name,u.username].some(v=>v.toLowerCase().includes(search))))
  .sort((a,b)=>(order.includes(a.role)?order.indexOf(a.role):order.length)-(order.includes(b.role)?order.indexOf(b.role):order.length)||a.name.localeCompare(b.name,'zh-CN')||a.username.localeCompare(b.username));
}
