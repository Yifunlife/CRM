import { refreshFollowupNotifications } from './followup-notifications';
import { processCustomerPool } from './customer-pool';
import { syncGoogleForms } from './google-form-sync';
import { refreshSalesSuite } from './sales-suite-server';
import { refreshQuoteBridge } from './quote-bridge';

// Preserve the existing task order and stop on failure. These jobs never replace
// the sales/CEO confirmation endpoints or automatically retry a confirmation.
export async function runScheduledWorkflow(scheduledTime:number,env:Cloudflare.Env){
 if(env.CRM_BACKEND_ORIGIN)return;
 const db=env.DB;if(!db)throw new Error('CRM database binding is missing');
 const runId=crypto.randomUUID();
 const emit=(module:string,operation:string,outcome:string,started:number)=>{try{console.log(JSON.stringify({event:'crm.scheduled',run_id:runId,module,operation,outcome,elapsed_ms:Date.now()-started}));}catch{/* Logging cannot change execution. */}};
 const step=async(module:string,operation:string,run:()=>Promise<unknown>)=>{
  const started=Date.now();try{await run();emit(module,operation,'completed',started);}catch(error){emit(module,operation,'failed',started);throw error;}
 };
 await step('notifications','refresh-followup-notifications',()=>refreshFollowupNotifications(db));
 await step('intake','process-customer-pool',()=>processCustomerPool(db));
 await step('google','sync-google-forms',()=>syncGoogleForms(db));
 // The shared scheduler runs every five minutes; dormant leads run at 08:00 Beijing only.
 await step('projects','refresh-sales-suite',()=>refreshSalesSuite(db,env.QUOTE_DB,undefined,new Date(scheduledTime).toISOString().slice(11,16)==='00:00'));
 await step('quotes','refresh-quote-bridge',()=>refreshQuoteBridge(db,env.QUOTE_DB));
}
