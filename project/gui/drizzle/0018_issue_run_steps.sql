CREATE TABLE `issue_run_step` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL REFERENCES `issue_run`(`id`) ON DELETE CASCADE,
  `idx` integer NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('message', 'tool_call', 'tool_result')),
  `tool` text,
  `call_id` text,
  `text` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `issue_run_step_run_idx` ON `issue_run_step` (`run_id`, `idx`);
