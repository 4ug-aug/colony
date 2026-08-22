CREATE TABLE `workspace_grant_tools` (
	`id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
	`mode` text NOT NULL DEFAULT 'all' CHECK (`mode` IN ('all', 'allowlist', 'model')),
	`tools_json` text NOT NULL DEFAULT '[]',
	`bundles_json` text NOT NULL DEFAULT '{}'
);
