import {copyFileSync,existsSync,mkdirSync,readdirSync,statSync,unlinkSync,utimesSync} from 'node:fs';
import {dirname,join} from 'node:path';

const retention=7*24*60*60*1000;
function files(root,prefix=''){
 if(!existsSync(join(root,prefix)))return [];
 return readdirSync(join(root,prefix),{withFileTypes:true}).flatMap(entry=>{
  const name=join(prefix,entry.name);
  return entry.isDirectory()?files(root,name):entry.isFile()&&/\.(js|css)$/.test(name)?[name]:[];
 });
}

export function retainStaticAssets(client,cache,now=Date.now()){
 const root=join(client,'_next/static'),stamp=new Date(now);
 const current=files(root);
 for(const name of current){
  const target=join(cache,name);
  mkdirSync(dirname(target),{recursive:true});
  copyFileSync(join(root,name),target);
  utimesSync(target,stamp,stamp);
 }
 let retained=0;
 for(const name of files(cache)){
  const source=join(cache,name);
  if(now-statSync(source).mtimeMs>retention){unlinkSync(source);continue;}
  const target=join(root,name);
  if(!existsSync(target)){
   mkdirSync(dirname(target),{recursive:true});
   copyFileSync(source,target);
   retained++;
  }
 }
 return {current:current.length,retained};
}
