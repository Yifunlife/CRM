CREATE TABLE `crm_followup_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `crm_followup_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_followup_events_order` ON `crm_followup_events` (`order_id`,`created`);--> statement-breakpoint
CREATE TABLE `crm_followup_files` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`step` integer NOT NULL,
	`name` text NOT NULL,
	`object_key` text NOT NULL,
	`size` integer NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `crm_followup_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_followup_files_object_key_unique` ON `crm_followup_files` (`object_key`);--> statement-breakpoint
CREATE INDEX `crm_followup_files_order` ON `crm_followup_files` (`order_id`);--> statement-breakpoint
CREATE TABLE `crm_followup_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`project` text NOT NULL,
	`lead_id` text NOT NULL,
	`deal_id` text,
	`commercial_id` text NOT NULL,
	`logistics_id` text NOT NULL,
	`stage` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`details` text NOT NULL,
	`steps` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`change_token` text NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deal_id`) REFERENCES `crm_deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`commercial_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`logistics_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_followup_orders_order_number_unique` ON `crm_followup_orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `crm_followup_orders_commercial` ON `crm_followup_orders` (`commercial_id`);--> statement-breakpoint
CREATE INDEX `crm_followup_orders_logistics` ON `crm_followup_orders` (`logistics_id`);--> statement-breakpoint
CREATE TABLE `crm_followup_staff` (
	`user_id` text PRIMARY KEY NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_followup_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`step` integer NOT NULL,
	`title` text NOT NULL,
	`impact` text NOT NULL,
	`contact_reply` text NOT NULL,
	`next_action` text NOT NULL,
	`owner_id` text NOT NULL,
	`due_at` text NOT NULL,
	`next_followup` text NOT NULL,
	`status` text DEFAULT '待处理' NOT NULL,
	`resolution` text DEFAULT '' NOT NULL,
	`confirmation` text DEFAULT '' NOT NULL,
	`notified` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `crm_followup_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crm_followup_tasks_order` ON `crm_followup_tasks` (`order_id`);