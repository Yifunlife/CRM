CREATE TABLE IF NOT EXISTS crm_workbench_history (
 owner_id TEXT NOT NULL REFERENCES crm_users(id),
 desktop_id TEXT NOT NULL,
 message_key TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 channel TEXT NOT NULL,
 sort_time REAL NOT NULL DEFAULT 0,
 source_index INTEGER NOT NULL,
 revision TEXT NOT NULL,
 payload TEXT NOT NULL,
 updated TEXT NOT NULL,
 PRIMARY KEY(owner_id,desktop_id,message_key)
);
CREATE INDEX IF NOT EXISTS crm_workbench_history_page ON crm_workbench_history(owner_id,desktop_id,sort_time,message_key);
CREATE TABLE IF NOT EXISTS crm_workbench_history_progress (
 owner_id TEXT NOT NULL REFERENCES crm_users(id),
 desktop_id TEXT NOT NULL,
 revision TEXT NOT NULL,
 total INTEGER NOT NULL,
 received INTEGER NOT NULL DEFAULT 0,
 complete INTEGER NOT NULL DEFAULT 0,
 updated TEXT NOT NULL,
 PRIMARY KEY(owner_id,desktop_id)
);
