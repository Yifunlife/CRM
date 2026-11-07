// Follow-up notes remain the source of truth; reading this view never copies them.
export const meetingRecordsSQL=`
 SELECT id,lead_id,payload,created FROM crm_sales_events WHERE kind='客户会议与到访'
 UNION ALL
 SELECT 'note:'||n.id,n.lead_id,json_object(
  'type',n.method,'date',substr(datetime(n.created,'+8 hours'),1,10),
  'participants',COALESCE(json_extract(e.payload,'$.participants'),''),
  'result',n.content,'next_action',n.next_step,'source','客户推进'
 ),n.created FROM crm_notes n
 LEFT JOIN crm_sales_events e ON e.id=n.id AND e.kind='业务员跟进记录'
 WHERE n.method IN ('线上会议','到访公司','拜访客户')
 UNION ALL
 SELECT 'reception:'||r.id,r.lead_id,json_object('type','到访公司','date',json_extract(r.payload,'$.date'),
  'participants',u.name,'result',COALESCE(json_extract(r.payload,'$.result'),''),'next_action',COALESCE(json_extract(r.payload,'$.next_action'),''),
  'source','接待登记','visit_id',r.id),r.created FROM crm_visit_receptions r JOIN crm_users u ON u.id=r.receptionist_id
 WHERE json_extract(r.payload,'$.completed')=1`;
export const VISIT_IMPORT_LIMIT=200;
export const VISIT_COLUMNS=[
 {key:'lead_id',label:'CRM客户ID',aliases:['客户ID','lead_id']},
 {key:'customer_name',label:'客户名称',aliases:['客户','客户姓名']},
 {key:'date',label:'到访日期',aliases:['日期','到访时间']},
 {key:'participants',label:'参与人',aliases:['到访人员','来访人员','参会人']},
 {key:'result',label:'到访结论',aliases:['结论','到访内容','到访记录']},
 {key:'next_action',label:'下一步行动',aliases:['下一步','后续行动']}
] as const;
