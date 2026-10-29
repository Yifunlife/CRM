CREATE TABLE `crm_sales_account_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`quote_email` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_sales_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`lead_id` text,
	`task_id` text,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `crm_sales_projects`(`project_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `crm_sales_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_sales_events_project` ON `crm_sales_events` (`project_id`,`created`);--> statement-breakpoint
CREATE TABLE `crm_sales_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`project_id` text,
	`lead_id` text NOT NULL,
	`task_id` text,
	`recipient_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`created` text NOT NULL,
	`read_at` text DEFAULT '' NOT NULL,
	`resolved_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `crm_sales_projects`(`project_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `crm_sales_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_sales_notifications_dedupe_key_unique` ON `crm_sales_notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `crm_sales_notifications_recipient` ON `crm_sales_notifications` (`recipient_id`,`created`);--> statement-breakpoint
CREATE TABLE `crm_sales_projects` (
	`project_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`customer_project_id` text,
	`lead_id` text NOT NULL,
	`stage` text DEFAULT 'qualification' NOT NULL,
	`stage_at` text NOT NULL,
	`amount_minor` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`expected_date` text DEFAULT '' NOT NULL,
	`forecast` text DEFAULT 'early' NOT NULL,
	`forecast_review` text DEFAULT '' NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`next_date` text DEFAULT '' NOT NULL,
	`blocker` text DEFAULT '' NOT NULL,
	`loss_reason` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`token` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`customer_project_id`) REFERENCES `crm_customer_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_sales_projects_customer_project_id_unique` ON `crm_sales_projects` (`customer_project_id`);--> statement-breakpoint
CREATE INDEX `crm_sales_projects_lead` ON `crm_sales_projects` (`lead_id`);--> statement-breakpoint
CREATE TABLE `crm_sales_quote_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`source_key` text NOT NULL,
	`summary` text DEFAULT '{}' NOT NULL,
	`sync_error` text DEFAULT '' NOT NULL,
	`synced` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `crm_sales_projects`(`project_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_sales_quote_links_source_key_unique` ON `crm_sales_quote_links` (`source_key`);--> statement-breakpoint
CREATE INDEX `crm_sales_quote_project` ON `crm_sales_quote_links` (`project_id`);--> statement-breakpoint
CREATE TABLE `crm_sales_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`lead_id` text NOT NULL,
	`order_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`owner_id` text NOT NULL,
	`due_at` text NOT NULL,
	`next_followup` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`deliverable` text DEFAULT '' NOT NULL,
	`next_action` text NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`token` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `crm_sales_projects`(`project_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `crm_followup_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_sales_tasks_owner` ON `crm_sales_tasks` (`owner_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `crm_sales_tasks_project` ON `crm_sales_tasks` (`project_id`,`status`);