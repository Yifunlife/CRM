export type CRMRoute={page:string;lead?:string;tab?:string;project?:string;market?:string;demo?:boolean;order?:string;suite?:string;dossierProject?:string;visit?:string};
const keys=['page','lead','tab','project','market','order','suite','dossierProject','visit'] as const;
export function crmLocation(scope:string,route:CRMRoute){const params=new URLSearchParams({scope});for(const key of keys)if(route[key])params.set(key,route[key]!);if(route.demo)params.set('demo','1');return '#crm?'+params;}
export function readCRMLocation(hash:string,scope:string):CRMRoute|null{
 if(!hash.startsWith('#crm?'))return null;
 const params=new URLSearchParams(hash.slice(5));if(params.get('scope')!==scope)return null;
 const page=params.get('page');if(!page||page.length>40)return null;
 const route:CRMRoute={page};for(const key of keys)if(key!=='page'){const value=params.get(key);if(value&&value.length<=150)route[key]=value;}
 if(route.tab&&!['客户资料','成交与收款','跟进','文件归档'].includes(route.tab))delete route.tab;
 route.demo=params.get('demo')==='1';return route;
}
