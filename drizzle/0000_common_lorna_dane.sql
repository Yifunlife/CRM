CREATE TABLE `crm_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`user_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`source` text NOT NULL,
	`created` text NOT NULL,
	`creator` text NOT NULL,
	`total` integer NOT NULL,
	FOREIGN KEY (`creator`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`channel` text DEFAULT '' NOT NULL,
	`entered` text DEFAULT '' NOT NULL,
	`owner_id` text,
	`original_owner` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '待首次联系' NOT NULL,
	`next_date` text DEFAULT '' NOT NULL,
	`last_contact` text DEFAULT '' NOT NULL,
	`detail` text NOT NULL,
	`fingerprint` text NOT NULL,
	`review` integer DEFAULT 0 NOT NULL,
	`batch_id` text,
	`created` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `crm_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_leads_fingerprint_unique` ON `crm_leads` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `crm_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`method` text NOT NULL,
	`next_step` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`password` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_users_username_unique` ON `crm_users` (`username`);