CREATE TABLE `grill` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('code', 'general')),
  `visibility` text NOT NULL CHECK (`visibility` IN ('invite-only', 'workspace-open')),
  `agent_definition_id` text NOT NULL,
  `repository` text,
  `base_ref` text,
  `frontier` text NOT NULL DEFAULT '{"questions":[],"drafts":{}}',
  `settled_answers` text NOT NULL DEFAULT '[]',
  `draft_artifacts` text,
  `created_by` text NOT NULL REFERENCES `user`(`id`),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `grill_participant` (
  `grill_id` text NOT NULL REFERENCES `grill`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `user`(`id`),
  PRIMARY KEY (`grill_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `grill_created_at_idx` ON `grill` (`created_at`);
