CREATE TABLE `crm_workbench_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`channel` text NOT NULL,
	`content` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_workbench_drafts_owner_lead_channel` ON `crm_workbench_drafts` (`lead_id`,`owner_id`,`channel`);--> statement-breakpoint
CREATE TABLE `crm_workbench_snapshots` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
