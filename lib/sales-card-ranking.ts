export function rankSalesCards<T extends {id:string;name:string;total_minor:number;unverified:number}>(rows:T[]){
 const sorted=[...rows].sort((a,b)=>Number(!!a.unverified)-Number(!!b.unverified)||b.total_minor-a.total_minor||a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id));
 let previous:number|undefined,rank=0;
 return sorted.map((row,index)=>{if(row.unverified||row.total_minor<=0)return {...row,rank:null};if(row.total_minor!==previous)rank=index+1;previous=row.total_minor;return {...row,rank};});
}
