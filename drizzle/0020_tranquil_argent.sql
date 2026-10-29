CREATE TABLE `crm_form_import_lock` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_form_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`occurred` text NOT NULL,
	`raw` text NOT NULL,
	`kind` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_form_submissions_lead` ON `crm_form_submissions` (`lead_id`);--> statement-breakpoint
CREATE TABLE `crm_lead_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`lead_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`created` text NOT NULL,
	`read_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_lead_notifications_dedupe_key_unique` ON `crm_lead_notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `crm_lead_notifications_recipient` ON `crm_lead_notifications` (`recipient_id`,`created`);