import {INSTALLATION_PROFILE_FIELDS,INSTALLATION_FACTORY_FIELDS,INSTALLATION_CLIENT_FIELDS,INSTALLATION_TRAVEL_FIELDS,INSTALLATION_ACCEPTANCE_FIELDS,installationReady,type InstallationPlan} from './project-installation';

export const INSTALLATION_STAGES=[
 {name:'安装要求',section:'profile',owner:'销售管理层维护',fields:INSTALLATION_PROFILE_FIELDS},
 {name:'师傅与工期',section:'factory',owner:'销售管理层确认',fields:INSTALLATION_FACTORY_FIELDS},
 {name:'到货与签证',section:'client',owner:'本项目商务确认',fields:INSTALLATION_CLIENT_FIELDS},
 {name:'机票行程',section:'travel',owner:'本项目商务登记',fields:INSTALLATION_TRAVEL_FIELDS},
 {name:'安装验收',section:'acceptance',owner:'客户验收 · 商务登记',fields:INSTALLATION_ACCEPTANCE_FIELDS}
] as const;

export function installationFieldValues(plan:InstallationPlan,row:any,stage:number):Record<string,string|boolean>{
 const values={...plan[INSTALLATION_STAGES[stage].section]};
 if(stage===0){values.area_m2=row?.area||'';values.planned_arrival??=row?.deliveryDate||'';values.site_contact??=row?.original?.details?.customer_contact||'';}
 if(stage===2)values.site_contact??=plan.profile.site_contact||'';
 if(stage===3)values.departure_date??=plan.factory.departure_date||'';
 return values;
}

export function installationFieldFilled(value:unknown){return value!==null&&value!==undefined&&String(value).trim()!==''&&!['待确认','待安排','待补充','待明确','未分配','待登记'].includes(String(value).trim());}

export function installationStageStatus(plan:InstallationPlan,stage:number,row?:any,draft?:Record<string,string|boolean>|null){
 const definition=INSTALLATION_STAGES[stage],values={...(draft||installationFieldValues(plan,row,stage))};
 let fields:readonly (readonly [string,string])[]=definition.fields;
 if(stage===2){
  const batches=plan.arrivals||[];
  if(batches.length)fields=fields.filter(([key])=>!['actual_arrival','actual_arrival_note'].includes(key));
  fields=[...fields,['arrival_batches','总到货批数'],...batches.flatMap((batch,i)=>[[`arrival-${batch.id}-expected`,`第${i+1}批预计到货日期`],[`arrival-${batch.id}-actual`,`第${i+1}批实际到货日期`]] as [string,string][])];
  values.arrival_batches=batches.length?String(batches.length):'';
  for(const batch of batches){values[`arrival-${batch.id}-expected`]=batch.expected;values[`arrival-${batch.id}-actual`]=batch.actual;}
 }
 const empty=fields.filter(([key])=>!installationFieldFilled(values[key])),total=fields.length,filled=total-empty.length;
 let label=filled===0?'未填写':filled===total?'已填齐':'部分已填',tone='empty';
 if(filled)tone=filled===total?'filled':'partial';
 if(stage===1&&plan.factory.confirmed){label='已确认';tone='confirmed';}
 else if(stage===2&&plan.client.confirmed){label=installationReady(plan)?'已确认':'待出行准备';tone=installationReady(plan)?'confirmed':'partial';}
 else if(stage===3&&plan.travel.issued){label=plan.travel.reconfirmation?'需重新确认':'已出票';tone=plan.travel.reconfirmation?'again':'confirmed';}
 else if(stage===4&&plan.acceptance.accepted){label='已验收';tone='confirmed';}
 else if(stage===4&&plan.acceptance.installed){label='待客户验收';tone='filled';}
 else if((stage===1||stage===2)&&filled===total)label='待确认';
 return {label,tone,filled,total,empty};
}
