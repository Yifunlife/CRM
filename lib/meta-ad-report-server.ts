export async function metaAdReport(db:D1Database){
 const [accounts,daily,campaigns]=await Promise.all([
  db.prepare('SELECT a.id,a.name,a.account_ref,a.currency,MIN(m.date) AS first_date,MAX(m.date) AS last_date,COUNT(*) AS detail_count,COUNT(DISTINCT CASE WHEN m.ad_id NOT LIKE \'source-row:%\' THEN m.ad_id END) AS ad_count,SUM(CASE WHEN m.ad_id LIKE \'source-row:%\' THEN 1 ELSE 0 END) AS unidentified_count,MAX(m.imported) AS imported FROM crm_meta_ad_daily m JOIN crm_operation_accounts a ON a.id=m.account_id GROUP BY a.id ORDER BY a.name').all(),
  db.prepare('SELECT account_id,date,SUM(spent) AS spent,SUM(impressions) AS impressions,SUM(clicks) AS clicks,SUM(results) AS results,result_type FROM crm_meta_ad_daily GROUP BY account_id,date,result_type ORDER BY date').all(),
  db.prepare("SELECT account_id,substr(date,1,7) AS date,campaign_id,MAX(campaign_name) AS campaign_name,SUM(spent) AS spent,SUM(impressions) AS impressions,SUM(clicks) AS clicks,SUM(results) AS results,result_type FROM crm_meta_ad_daily GROUP BY account_id,substr(date,1,7),campaign_id,result_type").all()
 ]);
 return {accounts:accounts.results,daily:daily.results,campaigns:campaigns.results};
}
