CREATE TABLE `crm_followup_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`day` text NOT NULL,
	`order_version` integer NOT NULL,
	`note` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `crm_followup_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_followup_checks_day` ON `crm_followup_checks` (`day`,`order_id`);--> statement-breakpoint
CREATE TABLE `crm_followup_notification_run` (
	`id` text PRIMARY KEY NOT NULL,
	`finished` text NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_followup_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`order_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`channel` text DEFAULT '站内' NOT NULL,
	`created` text NOT NULL,
	`read_at` text DEFAULT '' NOT NULL,
	`resolved_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `crm_followup_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_followup_notifications_dedupe_key_unique` ON `crm_followup_notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `crm_followup_notifications_recipient` ON `crm_followup_notifications` (`recipient_id`,`created`);--> statement-breakpoint
CREATE TABLE `crm_followup_records` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`category` text NOT NULL,
	`occurred_at` text NOT NULL,
	`payload` text NOT NULL,
	`task_id` text,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `crm_followup_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `crm_followup_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_followup_records_time` ON `crm_followup_records` (`order_id`,`occurred_at`);--> statement-breakpoint
ALTER TABLE `crm_followup_tasks` ADD `meta` text DEFAULT '{}' NOT NULL;