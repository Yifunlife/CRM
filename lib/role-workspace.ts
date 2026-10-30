export const DELIVERY_STAGES=['设计沟通中','项目下单','玩具下单','生产中','出货','待安装','已完成'] as const;
export const FOLLOWUP_PAGES=['跟单看板','接单确认','生产跟进','出货交付','单证制作','核对提单','费用对账','跟进收款'] as const;
export const PROCESS_FIELDS:Record<string,readonly string[]>={
 '接单确认':['合同编号与确认版本','PI编号','付款证明与核对状态','最终清单与图纸版本','资料缺项与补充人'],
 '生产跟进':['生产排期','工厂与负责人','生产进度','预计完工日期'],
 '出货交付':['验货与整改结论','货代询价与确认版本','发货日期与依据','船名航次与确定船期'],
 '单证制作':['商业发票编号与版本','装箱单编号与版本','复核人与核对结果'],
 '核对提单':['提单草稿编号与版本','收发货人与通知人核对','件数重量体积核对','放单方式与确认依据'],
 '费用对账':['货代账单编号','币种与物流费用','差额与原因','商务确认依据'],
 '跟进收款':['货款到账情况','到账日期与凭证','财务核对状态','客户验收及交付确认','未结事项与归档资料']
};
export function deliveryStage(order:any){
 if(order.archived)return '已完成';
 const flow=order.details?.execution;
 if(flow){const s=flow.stages||{};if(s.acceptance?.status==='已完成')return '已完成';if(s.shipping?.status==='已完成')return s.installation?.status==='已完成'?'已完成':'待安装';if(s.production?.status==='已完成'||s.stock?.status==='已完成')return '出货';if(s.handover?.status==='已完成')return '生产中';}
 if(DELIVERY_STAGES.includes(order.details?.business_stage))return order.details.business_stage;
 if(order.stage>=9)return '待安装';if(order.stage>=5)return '出货';if(order.stage>=3)return '生产中';if(order.stage===1||order.stage===2)return '设计沟通中';
 return order.details?.purchase_kind==='toy'?'玩具下单':'项目下单';
}
export function sumCurrencies(rows:any[],field:string){const sums:Record<string,number>={};for(const r of rows)if(r.currency&&Number.isSafeInteger(r[field]))sums[r.currency]=(sums[r.currency]||0)+r[field];return sums;}
