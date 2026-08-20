DELETE FROM `agent_definition_connection` WHERE `kind` = 'outlook';
--> statement-breakpoint
DELETE FROM `workspace_connection` WHERE `kind` = 'outlook';
--> statement-breakpoint
CREATE TABLE `user_connection` (
  `user_id` text NOT NULL REFERENCES `user` (`id`) ON DELETE CASCADE,
  `kind` text NOT NULL,
  `fields_json` text NOT NULL,
  `api_key_ciphertext` text,
  `api_key_iv` text,
  `api_key_tag` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`user_id`, `kind`)
);
