CREATE TABLE IF NOT EXISTS `chat` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `agent_definition_id` text NOT NULL,
  `title` text NOT NULL DEFAULT 'New chat',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `chat_account_updated_idx` ON `chat` (`account_id`, `updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_message` (
  `id` text PRIMARY KEY NOT NULL,
  `chat_id` text NOT NULL REFERENCES `chat`(`id`) ON DELETE CASCADE,
  `role` text NOT NULL CHECK (`role` IN ('user', 'assistant')),
  `text` text NOT NULL,
  `created_at` integer NOT NULL,
  `run_id` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `chat_message_chat_created_idx` ON `chat_message` (`chat_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_message_step` (
  `id` text PRIMARY KEY NOT NULL,
  `message_id` text NOT NULL REFERENCES `chat_message`(`id`) ON DELETE CASCADE,
  `idx` integer NOT NULL,
  `kind` text NOT NULL,
  `tool` text,
  `call_id` text,
  `text` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `chat_message_step_message_idx` ON `chat_message_step` (`message_id`, `idx`);
