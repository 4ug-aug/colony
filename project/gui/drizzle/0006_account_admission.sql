CREATE TABLE `admission_setup_token` (
	`id` integer PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`claimed_at` integer,
	`redeemed_at` integer
);
--> statement-breakpoint
ALTER TABLE `user` ADD `username` text;
--> statement-breakpoint
ALTER TABLE `user` ADD `display_username` text;
--> statement-breakpoint
ALTER TABLE `user` ADD `role` text DEFAULT 'user';
--> statement-breakpoint
ALTER TABLE `user` ADD `banned` integer;
--> statement-breakpoint
ALTER TABLE `user` ADD `ban_reason` text;
--> statement-breakpoint
ALTER TABLE `user` ADD `ban_expires` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);
--> statement-breakpoint
CREATE TABLE `workspace_invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`claimed_at` integer,
	`redeemed_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_invitation_token_hash_unique` ON `workspace_invitation` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `workspace_invitation_created_idx` ON `workspace_invitation` (`created_at`);
