CREATE TABLE crm_quote_acceptances (quote_id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES crm_sales_projects(project_id),lead_id TEXT NOT NULL REFERENCES crm_leads(id),actor_id TEXT NOT NULL REFERENCES crm_users(id),created TEXT NOT NULL);
CREATE TABLE crm_contract_confirmations (project_id TEXT PRIMARY KEY REFERENCES crm_sales_projects(project_id),order_id TEXT NOT NULL UNIQUE REFERENCES crm_followup_orders(id),quote_id TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES crm_users(id),created TEXT NOT NULL);
ALTER TABLE crm_followup_orders ADD COLUMN commercial_revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE crm_release_requests (id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES crm_followup_orders(id),kind TEXT NOT NULL CHECK(kind IN ('payment','special')),state TEXT NOT NULL CHECK(state IN ('pending','approved','rejected')),reason TEXT NOT NULL,evidence_file_id TEXT REFERENCES crm_followup_files(id),requested_by TEXT NOT NULL REFERENCES crm_users(id),created TEXT NOT NULL,decided_by TEXT REFERENCES crm_users(id),decided TEXT NOT NULL DEFAULT '',decision TEXT NOT NULL DEFAULT '',commercial_revision INTEGER NOT NULL);
CREATE INDEX crm_release_requests_order ON crm_release_requests(order_id,created);
ALTER TABLE crm_followup_files ADD COLUMN document_kind TEXT NOT NULL DEFAULT '执行资料';
ALTER TABLE crm_followup_files ADD COLUMN previous_id TEXT REFERENCES crm_followup_files(id);

DROP TRIGGER crm_workflow_ship_guard;
--> statement-breakpoint
CREATE TRIGGER crm_workflow_ship_guard BEFORE UPDATE ON crm_followup_orders
WHEN (json_extract(NEW.steps,'$[5].status')='已完成' AND json_extract(OLD.steps,'$[5].status') IS NOT '已完成')
 OR (json_extract(NEW.steps,'$[6].status')='已完成' AND json_extract(OLD.steps,'$[6].status') IS NOT '已完成')
 OR (COALESCE(json_extract(NEW.details,'$.dates.actual_ship.date'),'')<>'' AND json_extract(NEW.details,'$.dates.actual_ship.date') IS NOT json_extract(OLD.details,'$.dates.actual_ship.date'))
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM crm_contract_confirmations WHERE order_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM crm_release_requests WHERE order_id=NEW.id AND commercial_revision=NEW.commercial_revision AND state='approved') THEN RAISE(ABORT,'请先完成销售付款确认或CEO特殊放行审批') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM crm_contract_confirmations WHERE order_id=NEW.id) AND NOT (COALESCE(json_extract(NEW.details,'$.execution.profile.type'),'')='replacement' AND COALESCE(json_extract(NEW.details,'$.execution.profile.charge'),'')='free' AND COALESCE(json_extract(NEW.details,'$.contract_source.amount_minor'),-1)=0 AND COALESCE(json_extract(NEW.details,'$.contract_source.evidence'),'')<>'' AND COALESCE(json_extract(NEW.details,'$.execution.stages.release.status'),'')='已完成') AND NOT EXISTS(SELECT 1 FROM crm_workflow_releases r JOIN crm_workflow_contracts c ON c.deal_id=r.deal_id JOIN crm_deals d ON d.id=c.deal_id WHERE r.order_id=NEW.id AND r.deal_id=NEW.deal_id AND d.cancelled=0 AND r.contract_version=c.version) THEN RAISE(ABORT,'请先由管理员核实应收并确认发货放行；收款变化后须重新确认') END;
END;

CREATE UNIQUE INDEX crm_followup_source_document_once ON crm_followup_events(order_id,json_extract(payload,'$.source_id')) WHERE kind='同步商务文件';
