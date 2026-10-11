CREATE INDEX `crm_assignments_scope_month_owner` ON `crm_assignments` (`business_scope`,`allocation_month`,`owner_id`);--> statement-breakpoint
CREATE INDEX `crm_deals_scope_date` ON `crm_deals` (`business_scope`,`deal_date`);--> statement-breakpoint
CREATE INDEX `crm_deals_lead_owner` ON `crm_deals` (`lead_id`,`owner_id`);