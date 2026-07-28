ALTER TABLE `room` ADD `visibility` text DEFAULT 'public' NOT NULL;
--> statement-breakpoint
ALTER TABLE `room` ADD `created_by` text;
--> statement-breakpoint
CREATE TABLE `room_member` (
	`room_id` text NOT NULL REFERENCES `room`(`id`) ON DELETE cascade,
	`user_id` text NOT NULL,
	`added_by` text,
	`added_at` integer NOT NULL,
	PRIMARY KEY (`room_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `room_member_user_idx` ON `room_member` (`user_id`);
