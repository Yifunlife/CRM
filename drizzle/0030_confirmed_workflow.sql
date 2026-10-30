-- New classification metadata only: preserve original dates, statuses and ownership.
ALTER TABLE crm_leads ADD COLUMN cohort TEXT NOT NULL DEFAULT 'unknown' CHECK(cohort IN ('historical','new','unknown'));
UPDATE crm_leads SET cohort = CASE
 WHEN date(replace(entered,'/','-'), CASE WHEN instr(entered,'T')>0 THEN '+8 hours' ELSE '+0 hours' END)<'2026-11-01' THEN 'historical'
 WHEN date(replace(entered,'/','-'), CASE WHEN instr(entered,'T')>0 THEN '+8 hours' ELSE '+0 hours' END)>='2026-11-01' THEN 'new'
 WHEN date(created,'+8 hours')<'2026-11-01' THEN 'historical' ELSE 'unknown' END;
CREATE TRIGGER crm_lead_cohort_insert AFTER INSERT ON crm_leads WHEN NEW.cohort='unknown'
BEGIN
 UPDATE crm_leads SET cohort = CASE
 WHEN date(replace(NEW.entered,'/','-'), CASE WHEN instr(NEW.entered,'T')>0 THEN '+8 hours' ELSE '+0 hours' END)<'2026-11-01' THEN 'historical'
 WHEN date(replace(NEW.entered,'/','-'), CASE WHEN instr(NEW.entered,'T')>0 THEN '+8 hours' ELSE '+0 hours' END)>='2026-11-01' THEN 'new'
 WHEN date(NEW.created,'+8 hours')<'2026-11-01' THEN 'historical' ELSE 'unknown' END WHERE id=NEW.id;
END;
