export const RECORD_TYPES = [
 {key:'handover',name:'订单交接',step:0,fields:[['contract','合同／订单依据'],['products','产品及数量'],['drawing','确认图纸及版本'],['delivery','交期及付款节点'],['gaps','资料缺项']]},
 {key:'design',name:'设计与工程对接',step:1,fields:[['contact','设计／工程负责人'],['version','确认版本'],['feedback','客户意见与待解决事项']]},
 {key:'factory',name:'工厂跟进',step:3,fields:[['factory','工厂及联系人'],['progress','生产进度'],['expected','预计完成时间']]},
 {key:'inspection',name:'验货',step:5,fields:[['inspector','指定验货人'],['date','验货日期'],['requirements','检查要求'],['result','验货结果']]},
 {key:'rectification',name:'整改与复验',step:5,fields:[['defects','不合格项'],['responsible','整改负责人'],['deadline','整改期限'],['reinspection','复验人、日期及确认结果']]},
 {key:'forwarder',name:'货代对接',step:4,fields:[['arranger','安排方'],['contact','货代联系人'],['requirements','运输要求'],['quotation','报价及商务确认依据'],['booking','订舱和提货安排']]},
 {key:'shipment',name:'装柜发货',step:6,fields:[['actual','实际发货时间'],['list','发货清单'],['container','柜号'],['seal','封条号'],['confirmation','发货确认']]},
 {key:'documents',name:'单证与报关',step:6,fields:[['version','文件名称及版本'],['review','复核人及结果'],['submission','提交时间及接收方'],['changes','修改内容及处理结果']]},
 {key:'transit',name:'在途与到港',step:7,fields:[['tracking','物流查询结果'],['eta','预计到港时间及变化'],['notification','客户通知时间、方式与内容']]},
 {key:'installation',name:'收货与安装',step:9,fields:[['receipt','收货确认'],['damage','缺件／破损情况'],['contact','安装对接人'],['progress','安装进度及问题处理']]},
 {key:'archive',name:'完成归档',step:10,fields:[['delivery','交付资料'],['acceptance','验收记录'],['unresolved','未解决事项核对']]},
] as const;
export const chinaDay=(value:string)=>new Date(value).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
export function upcomingNodes(order:any,today:string){
 const until=new Date(Date.parse(today+'T00:00:00Z')+10*86400000).toISOString().slice(0,10);
 return [['planned_ship','发货'],['eta_port','到港'],['inspection','验货'],['installation','安装'],['eta_site','送达现场']].flatMap(([key,label])=>{
  const date=order.details?.dates?.[key]?.date;
  return date&&date>=today&&date<=until?[{key,label,date}]:[];
 });
}
