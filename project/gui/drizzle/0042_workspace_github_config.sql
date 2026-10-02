CREATE TABLE `workspace_github_config` (
	`id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
	`app_id` text NOT NULL,
	`app_slug` text NOT NULL,
	`installation_id` integer NOT NULL,
	`repository` text NOT NULL,
	`base` text NOT NULL,
	`api_key_ciphertext` text NOT NULL,
	`api_key_iv` text NOT NULL,
	`api_key_tag` text NOT NULL,
	`updated_at` integer NOT NULL
);
