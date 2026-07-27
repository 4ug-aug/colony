CREATE TABLE `run_step` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL REFERENCES `room_run`(`id`) ON DELETE cascade,
	`room_id` text NOT NULL,
	`idx` integer NOT NULL,
	`kind` text NOT NULL,
	`tool` text,
	`call_id` text,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `run_step_run_idx` ON `run_step` (`run_id`, `idx`);
