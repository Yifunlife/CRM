CREATE TABLE `crm_meta_ad_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`ad_id` text NOT NULL,
	`date` text NOT NULL,
	`ad_name` text NOT NULL,
	`campaign_id` text NOT NULL,
	`campaign_name` text NOT NULL,
	`adset_id` text NOT NULL,
	`adset_name` text NOT NULL,
	`spent` integer NOT NULL,
	`impressions` integer NOT NULL,
	`clicks` integer NOT NULL,
	`results` integer NOT NULL,
	`result_type` text NOT NULL,
	`raw_json` text NOT NULL,
	`source_file` text NOT NULL,
	`source_sha256` text NOT NULL,
	`imported` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `crm_operation_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_meta_ad_daily_identity` ON `crm_meta_ad_daily` (`account_id`,`ad_id`,`date`);--> statement-breakpoint
CREATE INDEX `crm_meta_ad_daily_date` ON `crm_meta_ad_daily` (`date`,`account_id`);