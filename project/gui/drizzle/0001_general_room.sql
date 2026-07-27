CREATE TABLE `room` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `room` (`id`, `name`) VALUES ('general', 'General');
--> statement-breakpoint
CREATE TABLE `room_message` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL REFERENCES `room`(`id`) ON DELETE cascade,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`author_image` text,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `room_message_room_created_idx` ON `room_message` (`room_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `room_run` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL REFERENCES `room`(`id`) ON DELETE cascade,
	`trigger_message_id` text NOT NULL REFERENCES `room_message`(`id`) ON DELETE cascade,
	`requested_by_id` text NOT NULL,
	`requested_by_name` text NOT NULL,
	`requested_by_image` text,
	`task` text NOT NULL,
	`agent_id` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`exit_code` integer,
	`error` text,
	`stdout` text NOT NULL,
	`stderr` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `room_run_room_created_idx` ON `room_run` (`room_id`, `created_at`);
