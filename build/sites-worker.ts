import {runScheduledWorkflow} from '../lib/workflow-scheduler';
import {WorkerEntrypoint} from 'cloudflare:workers';
import {syncQuotationChange} from '../lib/workflow-events';
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

export class QuoteWorkflow extends WorkerEntrypoint<Cloudflare.Env>{
  async quotationChanged(quoteId:string){
    if(!this.env.DB||!this.env.QUOTE_DB||this.env.CRM_BACKEND_ORIGIN)throw Error('CRM bindings unavailable');
    return syncQuotationChange(this.env.DB,this.env.QUOTE_DB,quoteId);
  }
}

export default {
  async scheduled(_event: ScheduledController, env: Cloudflare.Env) {
    await runScheduledWorkflow(_event.scheduledTime,env);
  },
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    // Keep the original company URL and desktop bridge working after cutover.
    if (env.CRM_BACKEND_ORIGIN === 'https://yifun-crm.yifunlife.workers.dev') {
      const source = new URL(request.url);
      const target = new URL(source.pathname + source.search, env.CRM_BACKEND_ORIGIN);
      const forwarded = new Request(target, request);
      if (forwarded.headers.get('origin') === source.origin) {
        forwarded.headers.set('origin', target.origin);
      }
      return fetch(forwarded);
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};
