import { refreshFollowupNotifications } from './followup-notifications';
import { syncGoogleForms } from './google-form-sync';
import { refreshSalesSuite } from './sales-suite-server';

// Business synchronization belongs to successful operations, never this clock.
export async function runScheduledWorkflow(scheduledTime:number,env:Cloudflare.Env){
 if(env.CRM_BACKEND_ORIGIN)return;
 const db=env.DB;if(!db)throw new Error('CRM database binding is missing');
 const runId=crypto.randomUUID();
 const emit=(module:string,operation:string,outcome:string,started:number)=>{try{console.log(JSON.stringify({event:'crm.scheduled',run_id:runId,module,operation,outcome,elapsed_ms:Date.now()-started}));}catch{/* Logging cannot change execution. */}};
 const step=async(module:string,operation:string,run:()=>Promise<unknown>)=>{
  const started=Date.now();try{await run();emit(module,operation,'completed',started);}catch(error){emit(module,operation,'failed',started);throw error;}
 };
 const at=new Date(scheduledTime).toISOString(),utc=at.slice(11,16);
 if(utc==='00:00'){
  // Run both independent reminder families even if one fails; retain failure logs.
  const results=await Promise.allSettled([
   step('notifications','daily-followup-reminders',()=>refreshFollowupNotifications(db,at)),
   step('projects','daily-sales-reminders',()=>refreshSalesSuite(db,undefined,at,true))
  ]);
  const failed=results.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
 }
 // Sydney 08:00 is UTC 21:00 or 22:00 depending on daylight saving.
 if(['21:00','22:00'].includes(utc)&&new Intl.DateTimeFormat('en-GB',{timeZone:'Australia/Sydney',hour:'2-digit',hourCycle:'h23'}).format(new Date(scheduledTime))==='08')
  await step('google','daily-google-forms',()=>syncGoogleForms(db,{at}));
}
