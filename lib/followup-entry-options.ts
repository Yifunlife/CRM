export const OTHER_ENTRY='其他，补充说明';
export const FOLLOWUP_ENTRY_OPTIONS:Record<string,{next:string[];content:string[];reply:string[]}>= {
 '接单确认':{next:['已建档，交接资料齐全','资料缺项，待商务补齐','待核对清单及确认版本','待确认交期及付款节点','待确认客户对接人'],content:['订单范围及收货要求','客户对接人与跟进安排','待补充的客户资料','已确认交期及后续节点'],reply:['客户已确认订单范围','客户已补充资料','客户要求调整收货资料']},
 '生产跟进':{next:['工厂已接单，排期已确认','核实工厂最新完工时间','待工厂提供本周进度','生产异常，待责任部门处理','交期变化，已通知商务'],content:['生产排期及预计完工时间','本周生产进度','下次进度反馈时间','经商务确认的交期调整'],reply:['客户已知悉生产进度','客户要求加快交期','客户提出进度疑问']},
 '出货交付':{next:['确认货代提货安排','待责任部门提供验货结论及照片','待商务、财务确认放行','包装资料已核齐','已发货，待更新运输信息'],content:['验货照片及责任部门确认结论','包装及发货安排','运输编号及预计到达时间','经商务确认的发货变更'],reply:['客户已收到验货照片','客户已确认发货安排','客户要求补充照片或运输信息']},
 '单证制作':{next:['待补齐单证资料','单证已制作，待复核','复核有修改，待更新版本','确认版本已留存'],content:['单证抬头及收货信息','清关文件要求','待客户核对的单证版本','已确认的单证文件'],reply:['客户已确认单证内容','客户要求修改抬头或收货信息','客户要求补充清关资料']},
 '核对提单':{next:['待取得提单草稿','提单草稿已核对，待客户确认','提单有误，待货代修改','到达前7天，待查询并联系客户','已查询到达消息并联系客户'],content:['提单草稿及核对事项','预计到港时间','预计到现场时间','尚无最新到达消息及下次反馈时间','清关、提货及收货准备'],reply:['客户已确认提单','客户要求修改提单','客户已确认清关或提货准备']},
 '费用对账':{next:['待核对账单及凭据','费用有差额，已通知商务','已提交商务，待沟通结果','待有权限人员确认费用处理','对账结果已确认并留存'],content:['已向商务提交费用凭据，待商务沟通','商务已转达费用核对情况','商务已确认处理方案并告知客户'],reply:['商务转达：客户已确认费用','商务转达：客户对费用有异议','商务尚未反馈客户沟通结果']},
 '跟进收款':{next:['已提醒商务跟进付款','待财务核实到账','待跟进收货或安装结果','问题待责任部门处理','未结事项已核齐，待归档','资料已归档'],content:['收货及缺件、破损情况','安装使用及验收安排','责任部门已确认的问题处理结果','商务转达的付款跟进情况'],reply:['客户已确认收货','客户反馈缺件或破损','客户反馈安装使用问题','客户已确认问题解决','商务尚未反馈付款沟通结果']}
};
export const EVIDENCE_TYPES=['WhatsApp聊天记录','微信聊天记录','邮件','电话纪要','商务转达记录'];
export function entryChoice(value:string,options:string[]){
 if(!value)return {choice:'',detail:''};
 const choice=options.find(option=>value===option||value.startsWith(option+'\n'));
 return choice?{choice,detail:value.slice(choice.length+(value===choice?0:1))}:{choice:OTHER_ENTRY,detail:value};
}
export function contentChoices(value:string,options:string[]){
 const lines=value?value.split('\n'):[],selected=lines.filter(line=>options.includes(line)),detail=lines.filter(line=>!options.includes(line)).join('\n');
 return {selected:[...new Set([...selected,...(detail?[OTHER_ENTRY]:[])])],detail};
}
