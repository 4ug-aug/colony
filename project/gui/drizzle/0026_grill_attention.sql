CREATE TABLE `grill_attention` (
	`id` text PRIMARY KEY NOT NULL,
	`grill_id` text NOT NULL REFERENCES `grill`(`id`) ON DELETE cascade,
	`recipient_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
	`kind` text NOT NULL CHECK (`kind` IN ('grill_invite')),
	`source_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`acknowledged_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grill_attention_source_unique` ON `grill_attention` (`recipient_id`,`kind`,`source_id`);
--> statement-breakpoint
CREATE INDEX `grill_attention_open_idx` ON `grill_attention` (`recipient_id`,`acknowledged_at`,`grill_id`);
