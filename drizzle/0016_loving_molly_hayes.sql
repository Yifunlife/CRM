CREATE TABLE `crm_customer_identity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `crm_customer_subjects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_customer_identity_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`other_lead_id` text,
	`subject_id` text,
	`proposal` text NOT NULL,
	`state` text DEFAULT '待核查' NOT NULL,
	`decision` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`token` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`other_lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_id`) REFERENCES `crm_customer_subjects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_customer_project_deals` (
	`deal_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`reason` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `crm_deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `crm_customer_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_customer_project_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`reason` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `crm_customer_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_customer_project_leads_pair` ON `crm_customer_project_leads` (`project_id`,`lead_id`);--> statement-breakpoint
CREATE TABLE `crm_customer_project_orders` (
	`order_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`reason` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `crm_followup_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `crm_customer_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_customer_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`name` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `crm_customer_subjects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_customer_projects_subject` ON `crm_customer_projects` (`subject_id`);--> statement-breakpoint
CREATE TABLE `crm_customer_subject_links` (
	`lead_id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`reason` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_id`) REFERENCES `crm_customer_subjects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_customer_subject_links_subject` ON `crm_customer_subject_links` (`subject_id`);--> statement-breakpoint
CREATE TABLE `crm_customer_subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`contacts` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_customer_subjects_code_unique` ON `crm_customer_subjects` (`code`);--> statement-breakpoint
-- Relationship-only migration: existing business tables and rows remain untouched.
CREATE TRIGGER crm_customer_link_no_move BEFORE UPDATE OF subject_id ON crm_customer_subject_links WHEN NEW.subject_id<>OLD.subject_id BEGIN
 SELECT RAISE(ABORT,'原主体关联仍存在，请先人工解除，不自动合并');
END;
--> statement-breakpoint
CREATE TRIGGER crm_customer_link_unlink_guard BEFORE DELETE ON crm_customer_subject_links BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM crm_customer_project_leads WHERE lead_id=OLD.lead_id)
 OR EXISTS(SELECT 1 FROM crm_customer_project_deals p JOIN crm_deals d ON d.id=p.deal_id WHERE d.lead_id=OLD.lead_id)
 OR EXISTS(SELECT 1 FROM crm_customer_project_orders p JOIN crm_followup_orders o ON o.id=p.order_id WHERE o.lead_id=OLD.lead_id)
 THEN RAISE(ABORT,'请先人工解除该咨询及订单的项目关联') END;
END;
--> statement-breakpoint
CREATE TRIGGER crm_customer_project_lead_guard BEFORE INSERT ON crm_customer_project_leads BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM crm_customer_subject_links l JOIN crm_customer_projects p ON p.subject_id=l.subject_id WHERE l.lead_id=NEW.lead_id AND p.id=NEW.project_id) THEN RAISE(ABORT,'咨询和项目必须属于同一已确认客户主体') END;
END;
--> statement-breakpoint
CREATE TRIGGER crm_customer_project_deal_guard BEFORE INSERT ON crm_customer_project_deals BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM crm_deals d JOIN crm_customer_subject_links l ON l.lead_id=d.lead_id JOIN crm_customer_projects p ON p.subject_id=l.subject_id WHERE d.id=NEW.deal_id AND p.id=NEW.project_id) THEN RAISE(ABORT,'成交和项目必须属于同一已确认客户主体') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM crm_customer_project_orders p JOIN crm_followup_orders o ON o.id=p.order_id WHERE o.deal_id=NEW.deal_id AND p.project_id<>NEW.project_id) THEN RAISE(ABORT,'成交与对应跟单须关联同一项目') END;
END;
--> statement-breakpoint
CREATE TRIGGER crm_customer_project_order_guard BEFORE INSERT ON crm_customer_project_orders BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM crm_followup_orders o JOIN crm_customer_subject_links l ON l.lead_id=o.lead_id JOIN crm_customer_projects p ON p.subject_id=l.subject_id WHERE o.id=NEW.order_id AND p.id=NEW.project_id) THEN RAISE(ABORT,'跟单和项目必须属于同一已确认客户主体') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM crm_followup_orders o JOIN crm_customer_project_deals p ON p.deal_id=o.deal_id WHERE o.id=NEW.order_id AND p.project_id<>NEW.project_id) THEN RAISE(ABORT,'成交与对应跟单须关联同一项目') END;
END;
--> statement-breakpoint
-- Only manually project-linked orders are affected by this consistency guard.
CREATE TRIGGER crm_customer_order_deal_guard BEFORE UPDATE OF deal_id ON crm_followup_orders WHEN NEW.deal_id IS NOT NULL BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM crm_customer_project_orders o JOIN crm_customer_project_deals d ON d.deal_id=NEW.deal_id WHERE o.order_id=NEW.id AND o.project_id<>d.project_id) THEN RAISE(ABORT,'成交与对应跟单须关联同一项目') END;
END;
