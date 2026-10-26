// Matching only produces review hints. It never establishes identity or changes source data.
const companyKey=(value:unknown)=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const emailKey=(value:unknown)=>String(value||'').trim().toLowerCase();
const phoneKey=(value:unknown)=>String(value||'').replace(/[^0-9]/g,'');
export function identityHints(a:any,b:any):string[]{
 const hints:string[]=[],phone=phoneKey(a.phone),email=emailKey(a.email);
 if(phone.length>=7&&phone===phoneKey(b.phone))hints.push('联系电话相同（未推断国家区号）');
 if(email&&email===emailKey(b.email))hints.push('邮箱相同');
 const first=companyKey(a.detail?.['公司名称']),second=companyKey(b.detail?.['公司名称']);
 if(first.length>=3&&first===second)hints.push('公司名称规范化后相同');
 else if(first.length>=4&&second.length>=4&&(first.includes(second)||second.includes(first)))hints.push('公司名称包含相近名称片段');
 return hints;
}
