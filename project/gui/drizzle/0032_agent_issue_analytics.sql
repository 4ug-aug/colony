CREATE INDEX `issue_created_by_kind_idx` ON `issue` (`created_by_kind`);
--> statement-breakpoint
CREATE INDEX `issue_status_owner_idx` ON `issue` (`status`, `owner_kind`);
