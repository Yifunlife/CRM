CREATE TABLE crm_sales_targets (
 owner_id TEXT NOT NULL REFERENCES crm_users(id),
 currency TEXT NOT NULL CHECK(currency IN ('CNY','USD')),
 period TEXT NOT NULL CHECK(period IN ('month','quarter','year')),
 period_start TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>=0),
 version INTEGER NOT NULL DEFAULT 1,
 updated TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES crm_users(id),
 PRIMARY KEY(owner_id,currency,period,period_start)
);
