CREATE TABLE `workspace_cursor_runtime_config` (
	`id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
	`model` text NOT NULL,
	`api_key_ciphertext` text NOT NULL,
	`api_key_iv` text NOT NULL,
	`api_key_tag` text NOT NULL
);
