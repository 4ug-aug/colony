CREATE TABLE `workspace_connection` (
  `kind` text PRIMARY KEY NOT NULL,
  `fields_json` text NOT NULL,
  `api_key_ciphertext` text,
  `api_key_iv` text,
  `api_key_tag` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_definition_connection` (
  `agent_definition_id` text NOT NULL,
  `kind` text NOT NULL REFERENCES `workspace_connection` (`kind`) ON DELETE CASCADE,
  PRIMARY KEY (`agent_definition_id`, `kind`)
);
--> statement-breakpoint
CREATE INDEX `agent_definition_connection_kind_idx` ON `agent_definition_connection` (`kind`);
