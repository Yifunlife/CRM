-- Reception planning is separate from historical contact evidence and financial receipts.
CREATE TABLE crm_visit_receptions (
 id TEXT PRIMARY KEY NOT NULL,
 lead_id TEXT NOT NULL REFERENCES crm_leads(id),
 receptionist_id TEXT NOT NULL REFERENCES crm_users(id),
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 revision TEXT NOT NULL,
 created TEXT NOT NULL,
 updated TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES crm_users(id)
);
CREATE INDEX crm_visit_receptions_owner ON crm_visit_receptions(receptionist_id,updated);
CREATE INDEX crm_visit_receptions_lead ON crm_visit_receptions(lead_id,updated);
