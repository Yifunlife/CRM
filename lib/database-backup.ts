import {readJson} from './object-storage';
export const backupTables=['crm_users','crm_batches','crm_leads','crm_notes','crm_assignments','crm_allocation_configs','crm_allocation_plans','crm_deals','crm_receipts','crm_operation_accounts','crm_operation_daily','crm_advertising','crm_google_connection','crm_workbench_snapshots','crm_workbench_drafts','crm_workbench_links','crm_workbench_bridge','crm_workbench_commands','crm_files','crm_followup_staff','crm_followup_orders','crm_followup_tasks','crm_followup_events','crm_followup_files','crm_followup_records','crm_followup_checks','crm_followup_notifications','crm_followup_notification_run','crm_workflow_contracts','crm_workflow_refunds','crm_workflow_releases','crm_workflow_audit','crm_workflow_handovers','crm_customer_subjects','crm_customer_subject_links','crm_customer_projects','crm_customer_project_leads','crm_customer_project_deals','crm_customer_project_orders','crm_customer_identity_reviews','crm_customer_identity_events','crm_attribution_campaigns','crm_attribution_spend','crm_attribution_leads','crm_attribution_deals','crm_attribution_quality','crm_lead_outcomes','crm_attribution_requests','crm_attribution_events'];

export function databaseBackup(db:D1Database):Response{
 const stream=new ReadableStream({async start(controller){
  const emit=(value:unknown)=>controller.enqueue(new TextEncoder().encode(JSON.stringify(value)+'\n'));
  try{
   emit({format:'yifun-crm-backup-v1',created:new Date().toISOString()});
   const counts:Record<string,number>={};
   for(const table of backupTables){
    counts[table]=0;
    for(let offset=0;;offset+=100){
     const {results}=await db.prepare(`SELECT * FROM ${table} ORDER BY rowid LIMIT 100 OFFSET ?`).bind(offset).all();
     for(const row of results){
      if(table==='crm_workbench_snapshots')row.payload=JSON.stringify(await readJson(String(row.payload)));
      if(table==='crm_workbench_commands')row.result=JSON.stringify(await readJson(String(row.result)));
      emit({table,row});counts[table]++;
     }
     if(results.length<100)break;
    }
   }
   emit({complete:true,counts});controller.close();
  }catch(error){controller.error(error);}
 }});
 return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Content-Disposition':'attachment; filename="yifun-crm-backup.ndjson"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
