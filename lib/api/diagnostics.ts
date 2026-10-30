import {identifyOperation,type Operation} from './operations';
export type DiagnosticEvent={request_id:string;module:string;operation:string;method:string;outcome:string;status:number;elapsed_ms:number;actor_id?:string;references?:Record<string,string>;error_type?:string;location?:string};
export type DiagnosticSink=(event:DiagnosticEvent)=>void;
const safeId=(value:any)=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)?value:undefined;
export class RequestTrace{
 readonly id=crypto.randomUUID();
 readonly started=Date.now();
 operation:Operation;
 actorId:string|undefined;
 references:Record<string,string>={};
 errorType:string|undefined;
 location:string|undefined;
 constructor(readonly request:Request,readonly sink:DiagnosticSink=event=>console.log(JSON.stringify({event:'crm.operation',...event}))){this.operation=identifyOperation(new URL(request.url).pathname.slice(5),request.method);}
 identify(body:any){
  this.operation=identifyOperation(new URL(this.request.url).pathname.slice(5),this.request.method,body);
  for(const key of ['lead_id','project_id','order_id','quote_id']){const value=safeId(body?.[key]);if(value)this.references[key]=value;}
 }
 actor(value:string){this.actorId=safeId(value);}
 failure(error:any){
  this.errorType=['Problem','AllocationError','TypeError','RangeError','Error'].includes(error?.constructor?.name)?error.constructor.name:'Error';
  // Keep only source locations, never exception messages, SQL parameters, URLs or customer content.
  this.location=typeof error?.stack==='string'?error.stack.split('\n').slice(1).map((line:string)=>line.match(/\b([\w.-]+\.(?:js|ts|mjs)):(\d+):(\d+)\b/)?.[0]).filter(Boolean).slice(0,3).join(' | ')||undefined:undefined;
 }
 event(status:number,outcome=status>=400?'failed':'completed'):DiagnosticEvent{return {request_id:this.id,...this.operation,method:this.request.method,outcome,status,elapsed_ms:Date.now()-this.started,actor_id:this.actorId,references:Object.keys(this.references).length?this.references:undefined,error_type:this.errorType,location:this.location};}
 emit(status:number){try{this.sink(this.event(status));}catch{/* Diagnostics must never change a business result. */}}
}
export async function tracedRequest(request:Request,execute:(request:Request,trace:RequestTrace)=>Promise<Response>,sink?:DiagnosticSink){
 const trace=new RequestTrace(request,sink);let response:Response;
 try{response=await execute(request,trace);}catch(error){trace.failure(error);trace.emit(500);throw error;}
 const headers=new Headers(response.headers);headers.set('X-CRM-Request-ID',trace.id);headers.set('X-CRM-Module',trace.operation.module);
 if(response.status>=500&&headers.get('content-type')?.includes('application/json')){
  try{const data:any=await response.clone().json();if(typeof data?.error==='string'){
   data.error+='（排查编号：'+trace.id+'）';headers.delete('content-length');response=new Response(JSON.stringify({...data,request_id:trace.id}),{status:response.status,headers});
  }}catch{/* Preserve the original error response if it is not a JSON object. */}
 }
 response=new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 trace.emit(response.status);return response;
}
