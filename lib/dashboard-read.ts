// Dashboard reports are read-only; retry a transient server failure once.
export async function readDashboard<T>(api:(path:string)=>Promise<T>,path:string):Promise<T>{
 try{return await api(path);}catch(error:any){
  if(!Number.isInteger(error?.status)||error.status<500||error.status>599)throw error;
  await new Promise(resolve=>setTimeout(resolve,Number.isFinite(error.retryAfter)&&error.retryAfter>0?Math.min(error.retryAfter,30)*1000:1000));
  return api(path);
 }
}
