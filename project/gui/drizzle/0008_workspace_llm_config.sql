CREATE TABLE `workspace_llm_config` (
	`id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`api_key_ciphertext` text NOT NULL,
	`api_key_iv` text NOT NULL,
	`api_key_tag` text NOT NULL
);
