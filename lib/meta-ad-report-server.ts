import {reportAcquiredDay} from './report-acquired-day';
export async function metaAdReport(db:D1Database){
 const source=await db.prepare('SELECT id,entered,created FROM crm_leads').all<{id:string;entered:string;created:string}>();
 const acquiredDates=JSON.stringify(source.results.map(l=>({id:l.id,day:reportAcquiredDay(l.entered)})));
 const [accounts,daily,campaigns,outcomes]=await Promise.all([
  db.prepare('SELECT a.id,a.name,a.account_ref,a.currency,MIN(m.date) AS first_date,MAX(m.date) AS last_date,COUNT(*) AS detail_count,COUNT(DISTINCT CASE WHEN m.ad_id NOT LIKE \'source-row:%\' THEN m.ad_id END) AS ad_count,SUM(CASE WHEN m.ad_id LIKE \'source-row:%\' THEN 1 ELSE 0 END) AS unidentified_count,MAX(m.imported) AS imported FROM crm_meta_ad_daily m JOIN crm_operation_accounts a ON a.id=m.account_id GROUP BY a.id ORDER BY a.name').all(),
  db.prepare('SELECT account_id,date,SUM(spent) AS spent,SUM(impressions) AS impressions,SUM(clicks) AS clicks,SUM(results) AS results,result_type FROM crm_meta_ad_daily GROUP BY account_id,date,result_type ORDER BY date').all(),
  db.prepare("SELECT account_id,substr(date,1,7) AS date,campaign_id,MAX(campaign_name) AS campaign_name,SUM(spent) AS spent,SUM(impressions) AS impressions,SUM(clicks) AS clicks,SUM(results) AS results,result_type FROM crm_meta_ad_daily GROUP BY account_id,substr(date,1,7),campaign_id,result_type").all(),
  db.prepare(`WITH eligible AS (
   SELECT l.*,COALESCE('subject:'||s.subject_id,'lead:'||l.id) AS identity_key,
   CASE WHEN p.id IS NOT NULL OR l.entered='' THEN date(l.created,'+8 hours') ELSE COALESCE(json_extract(ad.value,'$.day'),date(l.created,'+8 hours')) END AS acquired
   FROM crm_leads l JOIN json_each(?) ad ON json_extract(ad.value,'$.id')=l.id LEFT JOIN crm_customer_subject_links s ON s.lead_id=l.id LEFT JOIN crm_customer_pool p ON p.id=l.id
   WHERE l.review=0 AND (p.id IS NULL OR p.state='已入CRM' OR COALESCE(p.target_lead_id,'')<>'')
  ), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY identity_key ORDER BY acquired,created,id) AS rank FROM eligible), cohort AS (
   SELECT c.account_id,r.acquired,
   EXISTS(SELECT 1 FROM crm_deals d JOIN eligible e ON e.id=d.lead_id WHERE e.identity_key=r.identity_key AND d.cancelled=0 AND d.deal_date>=r.acquired AND d.deal_date<=date('now','+8 hours')) AS converted
   FROM ranked r JOIN crm_attribution_leads a ON a.lead_id=r.id AND a.source_kind='广告活动'
   JOIN crm_attribution_campaigns c ON c.id=a.campaign_id WHERE r.rank=1 AND r.acquired<=date('now','+8 hours')
   AND c.account_id IN (SELECT account_id FROM crm_meta_ad_daily)
  ) SELECT account_id,acquired AS date,COUNT(*) AS customers,SUM(converted) AS deals FROM cohort GROUP BY account_id,acquired ORDER BY acquired`).bind(acquiredDates).all()
 ]);
 return {accounts:accounts.results,daily:daily.results,campaigns:campaigns.results,outcomes:outcomes.results,outcomeCoverage:{status:outcomes.results.length?'partial':'unlinked',reason:outcomes.results.length?'仅统计已核实账号归因的客资；按首获客日期去重，追踪后续未撤销成交客户。缺少对应的期间仍为未关联。':'尚无可核实的CRM账号归因，客资和成交显示未关联，不能当作0。'}};
}
