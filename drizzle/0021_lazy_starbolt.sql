CREATE TABLE `crm_google_form_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`actor_id` text NOT NULL,
	`last_cutoff` text DEFAULT '' NOT NULL,
	`finished` text DEFAULT '' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`result` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
