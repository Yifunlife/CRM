CREATE TABLE `crm_workbench_links` (
	`lead_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`desktop_id` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_workbench_links_owner_desktop` ON `crm_workbench_links` (`owner_id`,`desktop_id`);