CREATE TABLE `schedule` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL CHECK (length(`name`) BETWEEN 1 AND 50),
  `agent_definition_id` text NOT NULL,
  `task` text NOT NULL CHECK (length(`task`) BETWEEN 1 AND 10000),
  `cron_expression` text NOT NULL,
  `timezone` text NOT NULL,
  `state` text NOT NULL CHECK (`state` IN ('active', 'paused', 'archived')),
  `created_by` text NOT NULL REFERENCES `user`(`id`),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `next_run_at` integer
);
--> statement-breakpoint
CREATE INDEX `schedule_active_next_run_idx` ON `schedule` (`next_run_at`) WHERE `state` = 'active';
--> statement-breakpoint
CREATE TABLE `schedule_run` (
  `id` text PRIMARY KEY NOT NULL,
  `schedule_id` text NOT NULL REFERENCES `schedule`(`id`) ON DELETE CASCADE,
  `source` text NOT NULL CHECK (`source` IN ('automatic', 'manual')),
  `scheduled_for` integer,
  `started_by` text REFERENCES `user`(`id`),
  `task` text NOT NULL,
  `agent_id` text NOT NULL,
  `state` text NOT NULL CHECK (`state` IN ('preparing', 'running', 'succeeded', 'failed', 'cancelled')),
  `created_at` integer NOT NULL,
  `started_at` integer,
  `completed_at` integer,
  `exit_code` integer,
  `error` text,
  `stdout` text NOT NULL,
  `stderr` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `schedule_run_history_idx` ON `schedule_run` (`schedule_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_one_active_run_idx` ON `schedule_run` (`schedule_id`) WHERE `state` IN ('preparing', 'running');
--> statement-breakpoint
CREATE TABLE `schedule_run_step` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL REFERENCES `schedule_run`(`id`) ON DELETE CASCADE,
  `idx` integer NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('message', 'tool_call', 'tool_result')),
  `tool` text,
  `call_id` text,
  `text` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `schedule_run_step_run_idx` ON `schedule_run_step` (`run_id`, `idx`);
