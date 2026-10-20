import { env } from 'cloudflare:workers';

// Immutable keys keep concurrent writes and rollback copies independent.
export async function storeJson(value:unknown, prefix:string, force=false):Promise<string>{
 const text=JSON.stringify(value);
 if(!force&&new TextEncoder().encode(text).byteLength<=16384)return text;
 if(!env.BUCKET)throw new Error('文件存储尚未连接');
 const key=`records/${prefix}/${crypto.randomUUID()}.json`;
 await env.BUCKET.put(key,text,{httpMetadata:{contentType:'application/json'}});
 return JSON.stringify({$r2:key});
}

export async function readJson(text:string):Promise<any>{
 const value=JSON.parse(text);
 if(!value||typeof value!=='object'||!Object.hasOwn(value,'$r2'))return value;
 if(typeof value.$r2!=='string'||!value.$r2.startsWith('records/'))throw new Error('文件引用无效');
 if(!env.BUCKET)throw new Error('文件存储尚未连接');
 const object=await env.BUCKET.get(value.$r2);
 if(!object)throw new Error('存储文件不存在，请联系管理员恢复');
 return object.json();
}
