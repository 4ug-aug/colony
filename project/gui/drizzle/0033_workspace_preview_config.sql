CREATE TABLE `workspace_preview_config` (
	`id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
	`init_command` text,
	`preview_command` text,
	`guest_port` integer NOT NULL,
	`grace_duration_ms` integer NOT NULL
);
