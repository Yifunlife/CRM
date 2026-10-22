CREATE TABLE `crm_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`deal_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`received_date` text NOT NULL,
	`cancelled` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `crm_deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `crm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_receipts_reference_unique` ON `crm_receipts` (`reference`);--> statement-breakpoint
CREATE INDEX `crm_receipts_deal_date` ON `crm_receipts` (`deal_id`,`received_date`);