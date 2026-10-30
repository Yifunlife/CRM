import {salesMonitor} from '../sales-monitor';
import {roleWorkspaceEndpoint as roleDashboardEndpoint} from '../role-workspace-server';
import {contractTemplateEndpoint} from '../contract-templates-server';
import {customerServiceEndpoint} from '../customer-service';
import {roleWorkspaceEndpoint} from '../role-workspaces';
import { advertisingEndpoint } from '../advertising-server';
import { allocationEndpoint } from '../allocation-server';
import { json } from '../api/http';
import { attributionEndpoint } from '../attribution-server';
import { cloudEndpoint } from '../cloud-communication';
import { confirmedWorkflow } from '../confirmed-workflow';
import { customerIdentityEndpoint } from '../customer-identity-server';
import { customerPoolEndpoint } from '../customer-pool';
import { phase1Endpoint } from '../followup-phase1-server';
import { historicalAlignment } from '../historical-alignment';
import { linkedEndpoint } from '../linked-whatsapp';
import { operationsEndpoint } from '../operations-server';
import { executionEndpoint } from '../order-execution-server';
import { followupEndpoint } from '../order-followup-server';
import { quoteBridgeEndpoint } from '../quote-bridge';
import {afterWorkflowWrite} from '../workflow-events';
import { salesHomeEndpoint } from '../sales-home-server';
import { salesPipelineEndpoint } from '../sales-pipeline-server';
import { salesSuiteEndpoint } from '../sales-suite-server';
import { teamFollowupEndpoint } from '../team-followup-server';
import { workbenchEndpoint } from '../workbench-server';
import { workflowEndpoint } from '../workflow-server';
import type { ApiContext } from './context';
import { notifications } from './notifications';
export async function businessModules(context:ApiContext):Promise<Response|undefined>{
 const {db,env,req,url,path,body,user,actor}=context;
 const monitor=await salesMonitor(db,env.QUOTE_DB,user,path,req.method);if(monitor!==undefined)return json(monitor);
 const template=await contractTemplateEndpoint(user,path,req.method,body);if(template!==undefined)return template instanceof Response?template:json(template);
 const dashboard=await roleDashboardEndpoint(db,user,actor,path,req.method,body,url,env.QUOTE_DB);if(dashboard!==undefined)return json(dashboard);
  const workspace=await roleWorkspaceEndpoint(db,user,path,req.method,url);if(workspace!==undefined)return json(workspace);
  const alignment=await historicalAlignment(db,user,actor,path,req.method,body);if(alignment!==undefined)return json(alignment);
  const confirmation=await confirmedWorkflow(db,env.QUOTE_DB,user,actor,path,req.method,body,url,{source:env.QUOTE_BUCKET,destination:env.BUCKET});if(confirmation!==undefined){if(req.method==='POST'&&path==='confirmations/quote'&&'id' in confirmation)await afterWorkflowWrite(db,env.QUOTE_DB,confirmation,{project:confirmation.id});return json(confirmation);}
  const bridgeResult=await quoteBridgeEndpoint(db,env.QUOTE_DB,user,actor,path,req.method,body,url);if(bridgeResult!==undefined)return json(bridgeResult);
  const suiteResult=await salesSuiteEndpoint(db,env.QUOTE_DB,user,actor,path,req.method,body,url);if(suiteResult!==undefined){if(req.method==='POST'&&['sales-suite/project/record','sales-suite/quotes/link','sales-suite/quotes/unlink','sales-suite/quotes/sync'].includes(path))await afterWorkflowWrite(db,env.QUOTE_DB,suiteResult,{project:body.project_id||body.id});return json(suiteResult);}
  const noticeResult=await notifications(context);if(noticeResult!==undefined)return noticeResult;
  const homeResult=await salesHomeEndpoint(db,user,path,req.method);if(homeResult!==undefined)return json(homeResult);
  const salesResult=await salesPipelineEndpoint(db,user,actor,path,req.method,body);if(salesResult!==undefined)return json(salesResult);
  const poolResult=await customerPoolEndpoint(db,user,actor,path,req.method,body);if(poolResult!==undefined)return json(poolResult);
  const attributionResult=await attributionEndpoint(db,user,actor,path,req.method,body,url);if(attributionResult!==undefined)return json(attributionResult);
  const teamResult=await teamFollowupEndpoint(db,user,path,req.method);if(teamResult!==undefined)return json(teamResult);
  const identityResult=await customerIdentityEndpoint(db,user,actor,path,req.method,body);if(identityResult!==undefined)return json(identityResult);
  const workflowResult=await workflowEndpoint(db,user,actor,path,req.method,body);if(workflowResult!==undefined)return json(workflowResult);
  const phase1Result=await phase1Endpoint(db,user,actor,path,req.method,body);if(phase1Result!==undefined){if(req.method==='POST'&&'id' in phase1Result&&phase1Result.id)await afterWorkflowWrite(db,env.QUOTE_DB,phase1Result,{order:phase1Result.id});return json(phase1Result);}
  const executionResult=await executionEndpoint(db,env.QUOTE_DB,user,actor,path,req.method,body,url);if(executionResult!==undefined){if(req.method==='POST'&&'id' in executionResult&&typeof executionResult.id==='string')await afterWorkflowWrite(db,env.QUOTE_DB,executionResult,{order:executionResult.id});return json(executionResult);}
  const followupResult=await followupEndpoint(db,user,actor,path,req.method,body);if(followupResult!==undefined){if(req.method==='POST'&&'id' in followupResult&&followupResult.id)await afterWorkflowWrite(db,env.QUOTE_DB,followupResult,{order:followupResult.id});return json(followupResult);}
  const service=await customerServiceEndpoint(db,user,actor,path,req.method,body);if(service!==undefined)return json(service);
  const linked=await linkedEndpoint(db,user,actor,path,req.method,body);if(linked!==undefined)return json(linked);
  const cloud=await cloudEndpoint(db,env as any,user,actor,path,req.method,body,url);if(cloud!==undefined)return json(cloud);
  const wb=await workbenchEndpoint(db,user,actor,path,req.method,body);if(wb!==undefined)return json(wb);
  const operationsResult=await operationsEndpoint(db,user,path,req.method,body);
  if(operationsResult!==undefined)return json(operationsResult);
  const advertisingResult=await advertisingEndpoint(db,user,path,req.method,body);
  if(advertisingResult!==undefined)return json(advertisingResult);
  const allocationResult=await allocationEndpoint(db,user,path,req.method,body,url);
  if(allocationResult!==undefined)return json(allocationResult);
}
