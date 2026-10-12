CREATE TABLE `crm_operation_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`currency` text NOT NULL,
	`account_ref` text DEFAULT '' NOT NULL,
	`owner_id` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_operation_accounts_platform_name` ON `crm_operation_accounts` (`platform`,`name`);--> statement-breakpoint
CREATE TABLE `crm_operation_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`followers_total` integer NOT NULL,
	`followers_change` integer NOT NULL,
	`posts` integer NOT NULL,
	`ad_spend` integer NOT NULL,
	`other_spend` integer NOT NULL,
	`revenue` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '有效' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `crm_operation_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_operation_daily_account_date` ON `crm_operation_daily` (`account_id`,`date`);--> statement-breakpoint
ALTER TABLE `crm_advertising` ADD `account_id` text REFERENCES crm_operation_accounts(id);