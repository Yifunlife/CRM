CREATE TABLE `crm_workflow_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_workflow_contracts` (
	`deal_id` text PRIMARY KEY NOT NULL,
	`currency` text NOT NULL,
	`total_minor` integer NOT NULL,
	`schedule` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `crm_deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_workflow_handovers` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`reason` text NOT NULL,
	`state` text DEFAULT '待接收' NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`accepted` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`from_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_workflow_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`receipt_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`refunded_date` text NOT NULL,
	`reason` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `crm_receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_workflow_refunds_reference_unique` ON `crm_workflow_refunds` (`reference`);--> statement-breakpoint
CREATE TABLE `crm_workflow_releases` (
	`order_id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`contract_version` integer NOT NULL,
	`special` integer NOT NULL,
	`reason` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `crm_followup_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deal_id`) REFERENCES `crm_deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Guards apply only to future writes; no historical business rows are rewritten.
CREATE UNIQUE INDEX crm_workflow_handover_pending ON crm_workflow_handovers(kind,entity_id) WHERE state='待接收';
--> statement-breakpoint
CREATE TRIGGER crm_workflow_refund_limit BEFORE INSERT ON crm_workflow_refunds BEGIN
 SELECT CASE WHEN NEW.amount_minor<=0 OR NOT EXISTS(SELECT 1 FROM crm_receipts r WHERE r.id=NEW.receipt_id AND r.cancelled=0 AND NEW.amount_minor+COALESCE((SELECT SUM(amount_minor) FROM crm_workflow_refunds WHERE receipt_id=r.id),0)<=r.amount_minor) THEN RAISE(ABORT,'退款金额超过可退金额或收款已撤销') END;
END;
--> statement-breakpoint
CREATE TRIGGER crm_workflow_receipt_cancel BEFORE UPDATE OF cancelled ON crm_receipts WHEN NEW.cancelled=1 AND OLD.cancelled=0 BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM crm_workflow_refunds WHERE receipt_id=OLD.id) THEN RAISE(ABORT,'已有退款的收款不能撤销') END;
END;
--> statement-breakpoint
CREATE TRIGGER crm_workflow_receipt_insert AFTER INSERT ON crm_receipts BEGIN
 UPDATE crm_workflow_contracts SET version=version+1 WHERE deal_id=NEW.deal_id;
END;
--> statement-breakpoint
CREATE TRIGGER crm_workflow_receipt_update AFTER UPDATE ON crm_receipts BEGIN
 UPDATE crm_workflow_contracts SET version=version+1 WHERE deal_id IN (OLD.deal_id,NEW.deal_id);
END;
--> statement-breakpoint
CREATE TRIGGER crm_workflow_refund_insert AFTER INSERT ON crm_workflow_refunds BEGIN
 UPDATE crm_workflow_contracts SET version=version+1 WHERE deal_id=(SELECT deal_id FROM crm_receipts WHERE id=NEW.receipt_id);
END;
--> statement-breakpoint
CREATE TRIGGER crm_workflow_deal_cancel BEFORE UPDATE OF cancelled ON crm_deals WHEN NEW.cancelled=1 AND OLD.cancelled=0 BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM crm_receipts WHERE deal_id=OLD.id AND cancelled=0) OR EXISTS(SELECT 1 FROM crm_followup_orders WHERE deal_id=OLD.id) THEN RAISE(ABORT,'存在有效收款或跟单，不能直接撤销成交') END;
END;
--> statement-breakpoint
CREATE TRIGGER crm_workflow_ship_guard BEFORE UPDATE ON crm_followup_orders
WHEN (json_extract(NEW.steps,'$[5].status')='已完成' AND json_extract(OLD.steps,'$[5].status') IS NOT '已完成')
 OR (json_extract(NEW.steps,'$[6].status')='已完成' AND json_extract(OLD.steps,'$[6].status') IS NOT '已完成')
 OR (COALESCE(json_extract(NEW.details,'$.dates.actual_ship.date'),'')<>'' AND json_extract(NEW.details,'$.dates.actual_ship.date') IS NOT json_extract(OLD.details,'$.dates.actual_ship.date'))
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM crm_workflow_releases r JOIN crm_workflow_contracts c ON c.deal_id=r.deal_id JOIN crm_deals d ON d.id=c.deal_id WHERE r.order_id=NEW.id AND r.deal_id=NEW.deal_id AND d.cancelled=0 AND r.contract_version=c.version) THEN RAISE(ABORT,'请先由管理员核实应收并确认发货放行；收款变化后须重新确认') END;
END;
--> statement-breakpoint
CREATE TRIGGER crm_workflow_won_guard BEFORE UPDATE OF status ON crm_leads WHEN NEW.status='已成交' AND OLD.status<>'已成交' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM crm_deals WHERE lead_id=NEW.id AND cancelled=0) THEN RAISE(ABORT,'标记已成交前需管理员确认有效成交单') END;
END;
--> statement-breakpoint
CREATE TRIGGER crm_workflow_handover_accept_guard BEFORE UPDATE OF state ON crm_workflow_handovers WHEN NEW.state='已接收' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM crm_users WHERE id=NEW.to_id AND active=1) THEN RAISE(ABORT,'接收账号已停用') END;
 SELECT CASE WHEN NEW.kind IN ('customer','commercial') AND NOT EXISTS(SELECT 1 FROM crm_users WHERE id=NEW.to_id AND role='sales') THEN RAISE(ABORT,'接收人不再是业务员') END;
 SELECT CASE WHEN NEW.kind='logistics' AND NOT EXISTS(SELECT 1 FROM crm_users u WHERE u.id=NEW.to_id AND (u.role='admin' OR json_extract(u.permissions,'$.followup_edit')=1 OR (json_extract(u.permissions,'$.followup_edit') IS NULL AND EXISTS(SELECT 1 FROM crm_followup_staff s WHERE s.user_id=u.id)))) THEN RAISE(ABORT,'接收人已无后勤维护权限') END;
 SELECT CASE WHEN NEW.kind='task' AND NOT EXISTS(SELECT 1 FROM crm_followup_tasks t JOIN crm_followup_orders o ON o.id=t.order_id WHERE t.id=NEW.entity_id AND t.status='待处理' AND o.archived=0) THEN RAISE(ABORT,'任务或订单已结束') END;
 SELECT CASE WHEN NEW.kind IN ('commercial','logistics') AND NOT EXISTS(SELECT 1 FROM crm_followup_orders WHERE id=NEW.entity_id AND archived=0) THEN RAISE(ABORT,'订单已归档') END;
END;
