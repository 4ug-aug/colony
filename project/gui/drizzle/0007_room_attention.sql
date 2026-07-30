CREATE TABLE `room_attention` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL REFERENCES `room`(`id`) ON DELETE cascade,
	`recipient_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
	`kind` text NOT NULL CHECK (`kind` IN ('mention', 'run_terminal')),
	`source_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`acknowledged_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_attention_source_unique` ON `room_attention` (`recipient_id`,`kind`,`source_id`);
--> statement-breakpoint
CREATE INDEX `room_attention_open_idx` ON `room_attention` (`recipient_id`,`acknowledged_at`,`room_id`);
