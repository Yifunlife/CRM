CREATE TABLE IF NOT EXISTS crm_communication_connections (
 owner_id TEXT PRIMARY KEY REFERENCES crm_users(id),
 mode TEXT NOT NULL CHECK(mode IN ('desktop','whatsapp')),
 updated TEXT NOT NULL
);
