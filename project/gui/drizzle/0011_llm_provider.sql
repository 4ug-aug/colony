ALTER TABLE `room_run` ADD `provider` text DEFAULT 'openai' NOT NULL;
--> statement-breakpoint
ALTER TABLE `schedule_run` ADD `provider` text DEFAULT 'openai' NOT NULL;
--> statement-breakpoint
ALTER TABLE `workspace_llm_config` ADD `provider` text DEFAULT 'openai' NOT NULL;
