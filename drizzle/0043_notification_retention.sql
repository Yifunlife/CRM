-- Keep only delivery keys after expiry so old messages cannot be delivered again.
CREATE TABLE crm_notification_deduplication (
 notification_type TEXT NOT NULL CHECK(notification_type IN ('followup','lead','sales')),
 dedupe_key TEXT NOT NULL,
 PRIMARY KEY(notification_type,dedupe_key)
);

CREATE TRIGGER crm_followup_notifications_expired BEFORE INSERT ON crm_followup_notifications
WHEN EXISTS(SELECT 1 FROM crm_notification_deduplication WHERE notification_type='followup' AND dedupe_key=NEW.dedupe_key)
BEGIN SELECT RAISE(IGNORE); END;

CREATE TRIGGER crm_lead_notifications_expired BEFORE INSERT ON crm_lead_notifications
WHEN EXISTS(SELECT 1 FROM crm_notification_deduplication WHERE notification_type='lead' AND dedupe_key=NEW.dedupe_key)
BEGIN SELECT RAISE(IGNORE); END;

CREATE TRIGGER crm_sales_notifications_expired BEFORE INSERT ON crm_sales_notifications
WHEN EXISTS(SELECT 1 FROM crm_notification_deduplication WHERE notification_type='sales' AND dedupe_key=NEW.dedupe_key)
BEGIN SELECT RAISE(IGNORE); END;
