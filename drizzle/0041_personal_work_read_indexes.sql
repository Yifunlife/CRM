-- Personal work queries previously rescanned ownership, assignments and notes per customer.
CREATE INDEX IF NOT EXISTS crm_leads_owner ON crm_leads(owner_id);
CREATE INDEX IF NOT EXISTS crm_assignments_lead_owner_created ON crm_assignments(lead_id,owner_id,created);
CREATE INDEX IF NOT EXISTS crm_assignments_lead_created ON crm_assignments(lead_id,created);
CREATE INDEX IF NOT EXISTS crm_notes_lead_created ON crm_notes(lead_id,created);
CREATE INDEX IF NOT EXISTS crm_pool_lead_state_updated ON crm_customer_pool(lead_id,state,updated);
CREATE INDEX IF NOT EXISTS crm_sales_events_lead_kind_created ON crm_sales_events(lead_id,kind,created);
