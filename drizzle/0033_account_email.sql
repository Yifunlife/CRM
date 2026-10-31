ALTER TABLE crm_users ADD COLUMN email TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX crm_users_email_unique ON crm_users(lower(email)) WHERE email<>'';
