CREATE TABLE `workspace_skill` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text NOT NULL,
  `content_hash` text NOT NULL,
  `storage_key` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_skill_name_unique` ON `workspace_skill` (`name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_skill_storage_key_unique` ON `workspace_skill` (`storage_key`);
--> statement-breakpoint
CREATE TABLE `agent_definition_skill` (
  `agent_definition_id` text NOT NULL,
  `skill_id` text NOT NULL REFERENCES `workspace_skill` (`id`) ON DELETE CASCADE,
  PRIMARY KEY (`agent_definition_id`, `skill_id`)
);
--> statement-breakpoint
CREATE INDEX `agent_definition_skill_skill_idx` ON `agent_definition_skill` (`skill_id`);
