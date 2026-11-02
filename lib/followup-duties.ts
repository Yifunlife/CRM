export const CUSTOMER_FOLLOWUP_STATES=['待同步客户','已同步，待回复','客户已确认','已同步，无需回复'] as const;
export const CUSTOMER_CHANNELS=['WhatsApp','邮件','电话','微信','业务员转达','其他'] as const;
export const FOLLOWUP_DUTIES:Record<string,{when:string;internal:string[];customer:string[]}>={
 '接单确认':{when:'业务正式交接后1个工作日内建档；资料缺项当天反馈。',internal:['核对已确认的合同、清单、图纸版本、交期及付款节点，明确各责任人。','资料不齐先建档，逐项记录补充人、期限和下次跟进时间。'],customer:['确认对接人、收货要求及已确认的订单范围，告知后续跟进安排。','涉及金额、付款条件或交期承诺，先交商务确认。']},
 '生产跟进':{when:'生产下单当天同步安排；生产期间每周至少跟进一次，有变化及时反馈。',internal:['确认工厂已接单、生产排期、实际进度和预计完工时间。','每次记录工厂联系人、回复、问题、下一步和依据；口头反馈当天记录。'],customer:['同步已安排生产、经核实的进度、预计完工及下次反馈时间。','异常先通知商务和责任部门；涉及金额或承诺变更，由商务沟通确认。']},
 '出货交付':{when:'发货前10天启动货代确认，不足10天立即启动；实际发货时间当天更新。',internal:['落实货代、包装、运输安排及适用单证复核；取得商务、财务放行后执行。','接收责任部门提供的验货结论和照片；验货及整改由责任部门负责。'],customer:['将责任部门提供的验货照片和已确认结论发给客户，记录发送依据。','确认收货信息，发货后同步运输编号、装柜照片和预计到达时间；到港与到现场分别记录。']},
 '单证制作':{when:'按使用节点制作及复核适用单证，发货前完成所需核对；缺件持续跟进。',internal:['制作商业发票、装箱单和适用清关资料，完成自查、复核并留确认版本。','未取得的资料明确补充人、期限，保留原版和修改记录。'],customer:['核对客户抬头、收货与清关要求，提供适用文件并跟进修改。','金额、费用或付款内容有变化，先通知商务确认后再对外使用。']},
 '核对提单':{when:'取得提单草稿后核对，按实际运输及文件节点处理；预计到达前7天主动联系客户，不足7天立即启动。',internal:['核对草稿版本、收发货人、件数、重量、体积和放单方式，取得所需确认。','向货代查询到港时间，记录清关、提货、收货准备及下一步。'],customer:['请客户核对草稿并记录回复或未回复，跟进正式文件交付。','无论是否查到最新到达时间，都主动联系客户，说明情况和下次反馈时间。']},
 '费用对账':{when:'收到账单或发现差额时及时核对；涉及金额先通知商务，不等日报。',internal:['核对报价、账单、币种、金额、差额和原因，提供凭据给商务。','经有权限人员确认后执行，保存批准及确认版本。'],customer:['由商务沟通客户承担的费用或费用异常，跟单提供依据并记录商务处理结果。','未经授权不承诺价格、费用、退款、补款或赔偿。']},
 '跟进收款':{when:'按合同付款节点提醒商务；收货、安装问题确认解决后1个工作日内更新，交付资料及时归档。',internal:['提醒商务跟进付款，由财务核实实际到账及未结事项。','收货、安装由对应部门负责，跟单记录进度、问题和已确认结果，核齐后归档。'],customer:['付款及金额沟通由商务负责；财务核实后按确认口径配合反馈。','跟进收货、缺件、破损及安装使用情况，留存客户验收和问题处理结果。']}
};
export const FOLLOWUP_TIME_RULES=[
 ['建档','业务正式交接给跟单后1个工作日内；缺项当天反馈，明确补充人及期限。'],
 ['客户回复','累计1个工作小时内；非工作时间最长3小时响应。未解决也先回复处理安排，到承诺时间再次反馈。'],
 ['日常跟进','每个订单每周至少一次；每项待办写明负责人、期限和下次跟进时间。'],
 ['日期变更','关键时间明确或变化后当天更新，同步商务、客户及相关部门，保留原值和变更原因。'],
 ['货代及到达','发货前10天确认货代，到达前7天查询并主动联系客户；交接时不足提前天数立即启动。'],
 ['异常及金额','异常及时通知商务和责任部门，不等日报；所有金额、费用先报商务，经有权限人员确认后执行。'],
 ['结果及日报','问题确认解决后1个工作日内更新结果；每天下班前提交简报，不用日报替代即时通知。']
];
export function readCustomerFollowup(input:any,previous:any,page:string,today:string,at:string){
 if(!input||typeof input!=='object'||Array.isArray(input))return {error:'客户跟进记录格式无效'};
 const fields=['date','method','content','reply','evidence','next_date','commercial_notice','inspection_photos'] as const;
 const value:any={status:input?.status||'待同步客户',money_related:['费用对账','跟进收款'].includes(page)||input?.money_related===true,has_inspection_photos:input?.has_inspection_photos===true};
 for(const field of fields){if(input?.[field]!==undefined&&typeof input[field]!=='string')return {error:'客户跟进内容须为文字'};value[field]=(input?.[field]||'').trim();if(value[field].length>2000)return {error:'客户跟进内容不能超过2000字'};}
 if(!CUSTOMER_FOLLOWUP_STATES.includes(value.status))return {error:'请选择有效的客户同步状态'};
 for(const key of ['date','next_date'])if(value[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(value[key])||!Number.isFinite(Date.parse(value[key]))||new Date(value[key]).toISOString().slice(0,10)!==value[key]))return {error:'请填写有效的客户跟进日期'};
 if(value.status!=='待同步客户'){
  if(!value.date||value.date>today)return {error:'请填写已实际发生的客户同步日期'};
  if(!CUSTOMER_CHANNELS.includes(value.method)||!value.content||!value.evidence)return {error:'请填写沟通方式、客户同步内容及沟通依据'};
  if(value.money_related&&!value.commercial_notice)return {error:'涉及金额或费用，请先记录通知商务及确认依据'};
  if(value.has_inspection_photos&&!value.inspection_photos)return {error:'请记录验货照片发给客户的依据'};
  if(value.status==='客户已确认'&&!value.reply)return {error:'请填写客户确认内容或回复依据'};
  if(value.status==='已同步，待回复'&&!value.next_date)return {error:'待客户回复时，请填写下次跟进日期'};
 }
 if(value.next_date&&value.date&&value.next_date<value.date)return {error:'下次跟进日期不能早于本次同步日期'};
 value.recorded_at=value.status==='待同步客户'?previous?.recorded_at||'':at;
 return {value,error:''};
}
