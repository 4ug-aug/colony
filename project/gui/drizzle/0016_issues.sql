CREATE TABLE `issue_counter` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `next_number` integer NOT NULL CHECK (`next_number` >= 1)
);
--> statement-breakpoint
INSERT INTO `issue_counter` (`id`, `next_number`) VALUES (1, 1);
--> statement-breakpoint
CREATE TABLE `issue` (
  `id` text PRIMARY KEY NOT NULL,
  `number` integer NOT NULL UNIQUE,
  `title` text NOT NULL CHECK (length(`title`) BETWEEN 1 AND 500),
  `description` text NOT NULL DEFAULT '' CHECK (length(`description`) <= 10000),
  `status` text NOT NULL CHECK (`status` IN ('backlog', 'todo', 'in_progress', 'in_review', 'done')),
  `priority` text NOT NULL CHECK (`priority` IN ('none', 'low', 'medium', 'high', 'urgent')),
  `tags` text NOT NULL DEFAULT '[]',
  `time_spent` text NOT NULL DEFAULT '[]',
  `parent_id` text REFERENCES `issue`(`id`) ON DELETE SET NULL,
  `owner_kind` text CHECK (`owner_kind` IS NULL OR `owner_kind` IN ('account', 'agent')),
  `owner_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CHECK (
    (`owner_kind` IS NULL AND `owner_id` IS NULL)
    OR (`owner_kind` IS NOT NULL AND `owner_id` IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX `issue_status_idx` ON `issue` (`status`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `issue_parent_idx` ON `issue` (`parent_id`);
--> statement-breakpoint
CREATE TABLE `issue_run` (
  `id` text PRIMARY KEY NOT NULL,
  `issue_id` text NOT NULL REFERENCES `issue`(`id`) ON DELETE CASCADE,
  `task` text NOT NULL,
  `agent_id` text NOT NULL,
  `provider` text NOT NULL DEFAULT 'openai',
  `model` text NOT NULL DEFAULT '',
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
CREATE INDEX `issue_run_history_idx` ON `issue_run` (`issue_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `issue_one_active_run_idx` ON `issue_run` (`issue_id`) WHERE `state` IN ('preparing', 'running');
