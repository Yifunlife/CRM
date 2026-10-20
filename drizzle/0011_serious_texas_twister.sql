CREATE TABLE `crm_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`desktop_id` text NOT NULL,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_files_object_key_unique` ON `crm_files` (`object_key`);--> statement-breakpoint
CREATE INDEX `crm_files_owner_desktop` ON `crm_files` (`owner_id`,`desktop_id`);