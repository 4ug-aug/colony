CREATE TABLE `room_attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL REFERENCES `room_message`(`id`) ON DELETE cascade,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `room_attachment_message_idx` ON `room_attachment` (`message_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_attachment_storage_key_unique` ON `room_attachment` (`storage_key`);
