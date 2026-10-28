CREATE TABLE `crm_customer_pool` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`raw` text NOT NULL,
	`payload` text NOT NULL,
	`state` text DEFAULT '待确认' NOT NULL,
	`lead_id` text,
	`target_lead_id` text,
	`version` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`created_by` text NOT NULL,
	`confirmed_by` text,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_pool_state_updated` ON `crm_customer_pool` (`state`,`updated`);--> statement-breakpoint
CREATE TABLE `crm_pool_events` (
	`id` text PRIMARY KEY NOT NULL,
	`intake_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`intake_id`) REFERENCES `crm_customer_pool`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_pool_events_intake` ON `crm_pool_events` (`intake_id`,`created`);--> statement-breakpoint
ALTER TABLE `crm_assignments` ADD `policy` text DEFAULT '' NOT NULL;