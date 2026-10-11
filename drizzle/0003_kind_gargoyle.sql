CREATE TABLE `crm_allocation_configs` (
	`scope` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_allocation_plans` (
	`key` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`month` text NOT NULL,
	`payload` text NOT NULL,
	`confirmed` text NOT NULL,
	`confirmed_by` text NOT NULL,
	FOREIGN KEY (`confirmed_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_deals` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`lead_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`business_scope` text NOT NULL,
	`deal_date` text NOT NULL,
	`cancelled` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_deals_order_number_unique` ON `crm_deals` (`order_number`);--> statement-breakpoint
ALTER TABLE `crm_assignments` ADD `business_scope` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_assignments` ADD `allocation_month` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_leads` ADD `business_scope` text DEFAULT '' NOT NULL;