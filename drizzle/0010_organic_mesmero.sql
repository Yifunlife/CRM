CREATE TABLE `crm_workbench_bridge` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_workbench_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`desktop_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`state` text NOT NULL,
	`result` text DEFAULT '{}' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`actor_id` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_workbench_commands_owner_state` ON `crm_workbench_commands` (`owner_id`,`state`);