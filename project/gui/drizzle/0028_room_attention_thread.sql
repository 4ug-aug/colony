CREATE TABLE `__new_room_attention` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL REFERENCES `room`(`id`) ON DELETE cascade,
	`recipient_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
	`kind` text NOT NULL CHECK (`kind` IN ('mention', 'run_terminal', 'thread_reply')),
	`source_id` text NOT NULL,
	`root_id` text REFERENCES `room_message`(`id`) ON DELETE cascade,
	`created_at` integer NOT NULL,
	`acknowledged_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_room_attention` (`id`, `room_id`, `recipient_id`, `kind`, `source_id`, `created_at`, `acknowledged_at`)
SELECT `id`, `room_id`, `recipient_id`, `kind`, `source_id`, `created_at`, `acknowledged_at` FROM `room_attention`;
--> statement-breakpoint
DROP TABLE `room_attention`;
--> statement-breakpoint
ALTER TABLE `__new_room_attention` RENAME TO `room_attention`;
--> statement-breakpoint
CREATE UNIQUE INDEX `room_attention_source_unique` ON `room_attention` (`recipient_id`,`kind`,`source_id`);
--> statement-breakpoint
CREATE INDEX `room_attention_open_idx` ON `room_attention` (`recipient_id`,`acknowledged_at`,`room_id`);
--> statement-breakpoint
CREATE INDEX `room_attention_root_idx` ON `room_attention` (`root_id`);
