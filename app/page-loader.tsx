'use client';
import {createElement,lazy as reactLazy,type ComponentType,type ComponentProps} from 'react';

const pages=new Set<()=>Promise<unknown>>();
const resets=new Set<()=>void>();

export function pageLoader<T>(load:()=>Promise<T>){
 let pending:Promise<T>|undefined;
 return ()=>pending??=load().catch(error=>{pending=undefined;throw error;});
}

export function lazyPage<T extends ComponentType<any>>(load:()=>Promise<{default:T}>){
 const preload=pageLoader(load);
 pages.add(preload);
 let Loaded=reactLazy(preload);
 resets.add(()=>{Loaded=reactLazy(preload);});
 return function Page(props:ComponentProps<T>){
  return createElement(Loaded,props);
 };
}

export function resetPageLoads(){
 // React.lazy caches rejections; replace those instances after a page fails.
 for(const reset of resets)reset();
}

export function preloadPages(){
 // Download code only: page components and their API requests remain unmounted.
 return Promise.allSettled(Array.from(pages,load=>load()));
}

export function isPageLoadError(error:Error){
 return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading (?:CSS )?chunk [\s\S]*failed|Unable to preload CSS|Failed to load module script/i.test(error.message);
}
