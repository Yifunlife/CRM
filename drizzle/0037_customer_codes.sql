CREATE TABLE IF NOT EXISTS crm_customer_codes (
 lead_id TEXT PRIMARY KEY REFERENCES crm_leads(id),
 code TEXT NOT NULL UNIQUE
);
