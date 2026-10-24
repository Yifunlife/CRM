export const BUSINESS_SCOPES = [
 {id:'douyin-local',name:'抖音本地推',source:'抖音'},
 {id:'meta-product',name:'Meta 场景＋单品',source:'Meta'},
 {id:'meta-full',name:'Meta 全案',source:'Meta'},
];
export type Member = {user_id:string; state:'参与'|'请假'|'暂停'; share:number};
export type Rule = {performance:number; maxChange:number; minimum:number; automatic:boolean; receipts?:boolean};
export type Config = {members:Member[]; rule:Rule};
export const defaultConfig = ():Config => ({members:[],rule:{performance:30,maxChange:10,minimum:5,automatic:false}});
export function monthNow(date=new Date()) { const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit'}).formatToParts(date);return p.find(v=>v.type==='year')!.value+'-'+p.find(v=>v.type==='month')!.value; }
export function nextMonth(month:string){const [y,m]=month.split('-').map(Number);return `${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}`;}
export function validMonth(month:string){return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);}
export function validateConfig(config:Config,users:{id:string;role:string;active:number}[]){
 if(!config || !Array.isArray(config.members) || !config.rule)throw new Error('分配设置格式不正确');
 const ids=new Set<string>();
 for(const m of config.members){if(ids.has(m.user_id)||!users.some(u=>u.id===m.user_id&&['sales','ceo','management'].includes(u.role)))throw new Error('请选择业务员，且每组不能重复');ids.add(m.user_id);if(!['参与','请假','暂停'].includes(m.state)||!Number.isFinite(m.share)||m.share<0||m.share>100||Math.abs(m.share*100-Math.round(m.share*100))>1e-6)throw new Error('占比必须为0至100，最多两位小数');if(m.state==='参与'&&!users.some(u=>u.id===m.user_id&&u.active))throw new Error('停用账号不能参与分配');}
 const r=config.rule;
 for(const v of [r.performance,r.maxChange,r.minimum])if(!Number.isFinite(v)||v<0||v>100)throw new Error('规则参数必须为0至100');
 if(typeof r.automatic!=='boolean')throw new Error('自动分配设置无效');
 const active=config.members.filter(m=>m.state==='参与'&&users.some(u=>u.id===m.user_id&&u.role==='sales'));
 const activeTotal=active.reduce((sum,m)=>sum+m.share,0),baseTotal=config.members.reduce((sum,m)=>sum+m.share,0);
 if(r.receipts===false&&active.length&&(activeTotal<=0||(Math.abs(activeTotal-100)>0.001&&Math.abs(baseTotal-100)>0.001)))throw new Error('参与人员的基础占比必须合计100%');
 if(r.receipts===false&&(active.some(m=>m.share/activeTotal*100<r.minimum)||active.length*r.minimum>100))throw new Error('参与人员的基础占比不能低于最低占比');
 if(r.automatic&&!config.members.length)throw new Error('设置参与人员后才能启用自动分配');
}
// Project onto bounded percentages, then round in basis points without losing the 100% total.
export function suggest(members:Member[],current:Record<string,number>,deals:Record<string,number>,rule:Rule){
 const active=members.filter(m=>m.state==='参与');if(!active.length)return [];
 const baseTotal=active.reduce((n,m)=>n+m.share,0);
 const base=(m:Member)=>baseTotal?m.share/baseTotal*100:100/active.length;
 const total=active.reduce((n,m)=>n+(deals[m.user_id]||0),0);
 const bounds=active.map(m=>({m,lo:Math.ceil(Math.max(rule.minimum,(current[m.user_id]??base(m))-rule.maxChange)*100-1e-7),hi:Math.floor(Math.min(100,(current[m.user_id]??base(m))+rule.maxChange)*100+1e-7),target:(total?base(m)*(1-rule.performance/100)+(deals[m.user_id]||0)/total*rule.performance:(current[m.user_id]??base(m)))*100}));
 if(bounds.some(b=>b.lo>b.hi)||bounds.reduce((n,b)=>n+b.lo,0)>10000||bounds.reduce((n,b)=>n+b.hi,0)<10000)throw new Error('人数或状态变化后，调整上限与最低占比冲突，请调整规则或基础占比');
 let low=-10000,high=10000;
 for(let k=0;k<60;k++){const mid=(low+high)/2,sum=bounds.reduce((n,b)=>n+Math.max(b.lo,Math.min(b.hi,b.target+mid)),0);if(sum<10000)low=mid;else high=mid;}
 const values=bounds.map(b=>Math.max(b.lo,Math.min(b.hi,b.target+(low+high)/2))),rounded=values.map(Math.floor);
 let left=10000-rounded.reduce((a,b)=>a+b,0);
 for(const i of values.map((v,i)=>({i,remainder:v-rounded[i]})).sort((a,b)=>b.remainder-a.remainder)){if(left&&rounded[i.i]<bounds[i.i].hi){rounded[i.i]++;left--;}}
 if(left)throw new Error('无法生成占比，请检查规则');
 return active.map((m,i)=>({user_id:m.user_id,share:rounded[i]/100,deals:deals[m.user_id]||0,current:current[m.user_id]??base(m)}));
}
export function effectiveShares(config:Config,plan:{shares:{user_id:string;share:number;inactive?:boolean;tier?:number}[]} | null,activeIds:string[]){
 const eligible=config.members.filter(m=>m.state==='参与'&&activeIds.includes(m.user_id));
 const weights=eligible.map(m=>{const p=plan?.shares.find(p=>p.user_id===m.user_id);return {user_id:m.user_id,share:config.rule.receipts===false?(p?.share??m.share):p&&!p.inactive?p.share:(100/eligible.length)*(1-(p?.tier||0)*.2)};});
 const sum=weights.reduce((n,m)=>n+m.share,0);if(!sum&&config.rule.receipts!==false&&eligible.length)return eligible.map(m=>({user_id:m.user_id,share:100/eligible.length}));return sum?weights.filter(m=>m.share>0).map(m=>({...m,share:m.share/sum*100})):[];
}

// Cash is stored in cents; currencies are never converted or combined.
export function receiptShares(members:Member[],tiers:Record<string,number>,cash:Record<string,{cny:number;usd:number}>,current:Record<string,number>={}){
 const active=members.filter(m=>m.state==='参与');if(!active.length)return [];
 const rows=active.map(m=>{const amounts=cash[m.user_id]||{cny:0,usd:0},qualified=amounts.cny>=5_000_000||amounts.usd>=1_000_000,previous=tiers[m.user_id]||0,tier=Math.max(0,Math.min(5,previous+(qualified?-1:1)));return {user_id:m.user_id,qualified,tier,previous,current:current[m.user_id]??100/active.length};});
 const winners=rows.filter(r=>r.qualified),base=100/rows.length;
 const leftover=rows.reduce((n,r)=>n+base*r.tier*.2,0);
 const raw=rows.map(r=>winners.length?base*(1-r.tier*.2)+(r.qualified?leftover/winners.length:0):base);
 const rounded=raw.map(v=>Math.floor(v*100+1e-8));let remainder=10000-rounded.reduce((a,b)=>a+b,0);
 for(const i of raw.map((v,i)=>({i,f:v*100-rounded[i]})).sort((a,b)=>b.f-a.f)){if(remainder>0){rounded[i.i]++;remainder--;}}
 return rows.map((r,i)=>({...r,share:rounded[i]/100}));
}
