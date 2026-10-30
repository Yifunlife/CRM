export type ExecutionProfile={type:'equipment'|'replacement'|'addition';production:boolean;inspection:boolean;shipping:'sea'|'express'|'land';installation:'ours'|'customer'|'none';charge:'paid'|'free';parent_contract:string;reason:string};
export type ExecutionField={key:string;label:string;type?:'date'|'select'|'textarea';options?:string[];required?:boolean;pass?:string[]};
export type ExecutionStage={key:string;name:string;legacy:number;fields:ExecutionField[]};
export const EXECUTION_TYPES={equipment:'设备订单',replacement:'售后补货',addition:'增项订单'};
const f=(key:string,label:string,type:ExecutionField['type']='textarea',options?:string[],pass?:string[]):ExecutionField=>({key,label,type,options,pass,required:true});
export function executionStages(p:ExecutionProfile):ExecutionStage[]{
 const stages:ExecutionStage[]=[{key:'handover',name:p.type==='replacement'?'补货确认':p.type==='addition'?'增项交接':'设备订单交接与建档',legacy:0,fields:[f('confirmation','商务交接资料核对','select',['资料待补充','已核对齐全'],['已核对齐全']),f('evidence','交接核对依据'),...(p.type==='replacement'?[f('reason','售后原因','select',['运输破损','缺件','质量问题','其他已确认原因']),f('issue_evidence','问题照片／售后记录'),f('specification','本次配件规格及数量'),f('approval','补货范围、费用及批准依据')]:[])]}];
 if(p.production)stages.push({key:'production',name:p.type==='addition'?'增项加工':'工厂进度跟进',legacy:3,fields:[f('factory','生产工厂及联系人'),f('contact_date','本次联系日期','date'),f('reply','工厂回复／未回复情况'),f('state','生产状态','select',['待生产','生产中','已完工'],['已完工']),f('expected','预计完工日期','date'),f('finished','实际完工日期','date'),f('payment','合同约定付款条件','select',['待确认','符合合同约定'],['符合合同约定']),f('evidence','生产及检查依据')]});
 else stages.push({key:'stock',name:'备货与出库检查',legacy:3,fields:[f('state','备货状态','select',['待备货','已备齐'],['已备齐']),f('specification','规格及数量检查','select',['待检查','与确认资料一致'],['与确认资料一致']),f('packing','包装检查','select',['待检查','检查合格'],['检查合格']),f('evidence','出库检查及照片依据')]});
 if(p.inspection)stages.push({key:'inspection',name:'指定验货、整改复验',legacy:5,fields:[f('inspector','指定验货人'),f('result','验货结论','select',['待验货','需整改','合格'],['合格']),f('rectification','整改复验情况','select',['无不合格项','整改中','整改及复验已完成'],['无不合格项','整改及复验已完成']),f('report','验货及适用复验报告'),f('release','工程／技术放行依据')]});
 if(p.shipping==='sea')stages.push({key:'freight',name:'货代安排确认',legacy:4,fields:[f('arranger','货代安排方','select',['我方','客户']),f('contact','货代公司、联系人及联系方式'),f('pickup','计划提货／装柜日期','date'),f('location','提货／装柜地点'),f('fees','费用与商务确认依据')]});
 stages.push({key:'release',name:p.charge==='free'?'补货发出批准':'收款与发货放行',legacy:5,fields:[f('confirmation',p.charge==='free'?'免费补货及运费批准':'商务及财务发货确认','select',['待确认','已确认可发出'],['已确认可发出']),f('evidence','批准或放行依据')]});
 stages.push({key:'shipping',name:p.shipping==='sea'?'装柜发货':p.shipping==='express'?'快递发出':'运输发出',legacy:6,fields:[f('carrier','承运方及联系人'),f('tracking','物流／提单编号'),f('date','实际发出日期','date'),f('documents','适用装箱、运输资料及照片'),f('fee','运费及承担方、批准依据'),...(p.shipping!=='sea'?[f('eta','预计到现场日期','date')]:[]),f('notice','客户及商务通知日期','date')]});
 if(p.shipping==='sea')stages.push({key:'arrival',name:'运输及到达前跟进',legacy:7,fields:[f('contact','联系货代日期','date'),f('eta','预计到港日期','date'),f('site','预计到现场日期','date'),f('notice','主动联系客户日期','date'),f('clearance','清关与提货资料','select',['资料待补充','资料已齐全'],['资料已齐全']),f('evidence','沟通及资料依据')]});
 stages.push({key:'receipt',name:'签收与问题处理',legacy:8,fields:[f('date','客户签收日期','date'),f('proof','签收凭证'),f('condition','数量和外观','select',['齐全完好','曾有缺件或破损']),f('issues','收货问题','select',['无问题','未解决','已解决'],['无问题','已解决']),f('evidence','检查或问题处理结果依据')]});
 if(p.installation!=='none')stages.push({key:'installation',name:p.installation==='ours'?'现场安装与交接':'客户自装与使用确认',legacy:9,fields:[...(p.installation==='ours'?[f('owner','安装负责人及现场联系人')]:[f('guide','提供给客户的安装指引')]),f('date','安装完成日期','date'),f('result','安装及运行情况','select',['安装中','存在问题','正常运行'],['正常运行']),f('evidence','安装／客户确认依据')]});
 stages.push({key:'acceptance',name:p.type==='replacement'?'售后问题解决确认':'交付验收',legacy:10,fields:[f('date','客户确认日期','date'),f('result','交付结果','select',['待客户确认','存在问题','客户确认完成'],['客户确认完成']),f('evidence','客户确认及验收依据')]});
 stages.push({key:'archive',name:p.type==='replacement'?'售后关闭':'订单归档',legacy:11,fields:[f('archive','合同、图纸及执行资料归档位置'),f('issues','遗留事项','select',['仍有未解决事项','全部已解决'],['全部已解决'])]});
 return stages;
}
export function executionCurrent(order:any){const flow=order.details?.execution;if(!flow)return null;const stages=executionStages(flow.profile);return stages.find(s=>flow.stages?.[s.key]?.status!=='已完成')||stages[stages.length-1];}
export function executionTitle(order:any){return executionCurrent(order)?.name||'';}
export function executionListSummary(order:any,latestRecord?:any){
 const flow=order.details?.execution,date=order.details?.dates?.inspection?.date;
 const inspection=!flow?date||'待确认':!flow.profile.inspection?'不适用':flow.stages?.inspection?.status==='已完成'?['已完成',date].filter(Boolean).join(' · '):date||flow.stages?.inspection?.status||'待验货';
 const stages=flow?executionStages(flow.profile):[];
 const latest=Object.entries(flow?.stages||{}).filter(([key,value]:[string,any])=>stages.some(s=>s.key===key)&&value.at).sort(([,a]:any,[,b]:any)=>Date.parse(a.at)-Date.parse(b.at)).at(-1) as [string,any]|undefined;
 const note=latestRecord?.payload?.content;
 const activity=note&&(!latest||Date.parse(latestRecord.occurred_at||latestRecord.created)>=Date.parse(latest[1].at))?note:latest?stages.find(s=>s.key===latest[0])!.name+' · '+latest[1].status:flow?'尚未填写执行记录':'暂无过程记录';
 return {inspection,activity};
}
export function executionLate(date:string,today:string){return date&&date<today?Math.floor((Date.parse(today)-Date.parse(date))/86400000):0;}
