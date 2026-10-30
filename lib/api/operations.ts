// Diagnostic names are stable contracts. Business validation remains in each owning module.
export const MODULES={
 intake:{name:'客资进入',entry:'lib/api/intake.ts',tests:['confirmed-intake','form-intake','customer-pool']},
 history:{name:'历史归属对齐',entry:'lib/historical-alignment.ts',tests:['confirmed-intake','confirmed-cohort']},
 allocation:{name:'客资分配',entry:'lib/allocation-server.ts',tests:['global-allocation','assignment-reminders','assignment-sync']},
 customers:{name:'客户档案与跟进',entry:'lib/api/customers.ts',tests:['sales-access','customer-progress','customer-identity','customer-page']},
 communication:{name:'客户沟通',entry:'lib/communication-progress.ts',tests:['communication-progress','linked-whatsapp','cloud-communication']},
 projects:{name:'销售项目',entry:'lib/sales-suite-server.ts',tests:['sales-suite']},
 quotes:{name:'报价确认接收',entry:'lib/confirmation/quotes.ts',tests:['workflow-confirmations']},
 contracts:{name:'合同确认建单',entry:'lib/confirmation/contract.ts',tests:['workflow-confirmations']},
 documents:{name:'合同档案与附件',entry:'lib/confirmation/documents.ts',tests:['workflow-confirmations','order-followup']},
 execution:{name:'订单执行',entry:'lib/order-execution-server.ts',tests:['order-execution-summary','order-followup']},
 orders:{name:'订单维护',entry:'lib/order-followup-server.ts',tests:['order-followup','followup-role','follower-changes','order-import','followup-phase1']},
 release:{name:'付款与特殊放行',entry:'lib/confirmation/release.ts',tests:['workflow-confirmations']},
 finance:{name:'成交与实际收款',entry:'lib/api/finance.ts',tests:['workflow','sales-suite']},
 notifications:{name:'站内通知',entry:'lib/api/notifications.ts',tests:['followup-phase1-scheduled','workflow-confirmations']},
 monitor:{name:'销售智能监控',entry:'lib/sales-monitor.ts',tests:['sales-monitor','customer-entry-monitor']},
 reports:{name:'销售与运营统计',entry:'lib/sales-home-server.ts',tests:['sales-home','sales-pipeline','operations-report','operations-dashboard','crm-monthly-cohort','team-followup','attribution']},
 accounts:{name:'账号与权限',entry:'lib/api/accounts.ts',tests:['permissions','sales-access']},
 google:{name:'Google来源连接',entry:'lib/api/google.ts',tests:['form-intake']},
 workflow:{name:'原业务核查与交接',entry:'lib/workflow-server.ts',tests:['workflow']},
 backup:{name:'备份',entry:'lib/database-backup.ts',tests:['database-backup']},
 unknown:{name:'未识别入口',entry:'app/api/[...path]/route.ts',tests:['sales-access']}
} as const;
export type ModuleId=keyof typeof MODULES;
export type Operation={module:ModuleId;operation:string};
export function identifyOperation(path:string,method:string,body?:any):Operation{
 const exact:Record<string,ModuleId>={'sales-monitor':'monitor','sales-monitor/customer-rules':'monitor',login:'accounts',logout:'accounts',me:'accounts',password:'accounts',users:'accounts',import:'intake',batches:'intake','business-scope':'intake',review:'intake','import-assignments':'history',assign:'allocation',leads:'customers','leads-page':'customers',grade:'customers',deals:'finance',receipts:'finance',advertising:'reports','admin/backup':'backup','followup/execution/quotes':'execution','confirmations/quotes':'quotes','confirmations/quote':'quotes','confirmations/contract':'contracts','confirmations/followers':'contracts','confirmations/documents':'documents','confirmations/releases':'release','confirmations/release':'release','confirmations/release/decision':'release'};
 if(exact[path])return {module:exact[path],operation:path};
 if(path==='followup')return {module:method==='POST'&&typeof body?.id==='string'&&!Object.hasOwn(body,'project')?'customers':'orders',operation:method==='POST'&&typeof body?.id==='string'&&!Object.hasOwn(body,'project')?'customers/followup':'followup'};
 const execution=/^followup\/orders\/[^/]+\/execution(?:\/(configure|source|stage|quote))?$/.exec(path);
 if(execution)return {module:'execution',operation:'followup/orders/:id/execution'+(execution[1]?'/'+execution[1]:'')};
 for(const [prefix,module] of [['historical-alignment','history'],['allocation','allocation'],['customer-pool','intake'],['customer-identity','customers'],['leads','customers'],['linked','communication'],['cloud','communication'],['bridge','communication'],['workbench','communication'],['sales-suite','projects'],['followup-notifications','notifications'],['contract-files','documents'],['followup/files','documents'],['followup-phase1','orders'],['followup','orders'],['sales-home','reports'],['sales-pipeline','reports'],['team-followup','reports'],['operations','reports'],['attribution','reports'],['users','accounts'],['google','google'],['workflow','workflow']] as [string,ModuleId][]){
  if(path===prefix||path.startsWith(prefix+'/'))return {module,operation:prefix};
 }
 return {module:'unknown',operation:'unknown'};
}
