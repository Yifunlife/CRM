ALTER TABLE crm_leads ADD COLUMN market TEXT NOT NULL DEFAULT '待确认'
  CHECK (market IN ('内贸','外贸','待确认'));

-- Only copy confirmed labels. Unlabelled historical records retain legacy classification.
UPDATE crm_leads SET market=json_extract(detail,'$.客资市场')
WHERE json_valid(detail) AND json_extract(detail,'$.客资市场') IN ('内贸','外贸');

CREATE INDEX crm_leads_market_owner ON crm_leads(market,owner_id);
