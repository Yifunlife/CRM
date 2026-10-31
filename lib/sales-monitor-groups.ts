import type {MonitorItem} from './sales-monitor';
export type MonitorGroup={id:string;name:string;count:number;items:MonitorItem[]};
// Stable record prefixes identify the owning check; grouping never changes its outcome.
const labels:Record<string,string>={first:'新增客资待首次联系',next:'项目缺少下一步计划',sync:'报价同步异常',accept:'报价待接收',contract:'成交报价待交接确认',invalid:'关联报价不可用','missing-order':'合同与订单关联异常',release:'放行待确认或审批',device:'沟通连接异常','sales-notice':'项目到期提醒'};
function category(item:MonitorItem){
 const prefix=item.id.split(':')[0];
 if(prefix==='order-notice'){
  const type=/金额/.test(item.title)?'money':/紧急|异常/.test(item.title)?'exception':item.level==='到期提醒'?'due':'pending';
  return {id:'order:'+type,name:({money:'跟单金额待确认',exception:'跟单异常与紧急事项',due:'跟单到期提醒',pending:'跟单待办'} as Record<string,string>)[type]};
 }
 return labels[prefix]?{id:prefix,name:labels[prefix]}:{id:'other:'+item.stage+':'+item.level,name:item.stage+' · '+item.level};
}
export function groupMonitorItems(items:MonitorItem[]):MonitorGroup[]{
 const groups=new Map<string,MonitorGroup>();
 for(const item of items){const key=category(item);let group=groups.get(key.id);if(!group){group={...key,count:0,items:[]};groups.set(key.id,group);}group.count+=item.count;group.items.push(item);}
 return [...groups.values()];
}
