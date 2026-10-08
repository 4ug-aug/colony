CREATE TABLE `watched_pull_request` (
	`repository` text NOT NULL,
	`number` integer NOT NULL,
	`agent_definition_id` text NOT NULL,
	`responsible_account_id` text NOT NULL,
	`issue_id` text,
	`cursor` text NOT NULL,
	`checked_sha` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`repository`, `number`)
);
