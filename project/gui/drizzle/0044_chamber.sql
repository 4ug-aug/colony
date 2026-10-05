ALTER TABLE `room` ADD `kind` text DEFAULT 'room' NOT NULL;
--> statement-breakpoint
ALTER TABLE `room` ADD `chamber_account_id` text;
--> statement-breakpoint
ALTER TABLE `room` ADD `agent_definition_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `room_chamber_idx` ON `room` (`chamber_account_id`, `agent_definition_id`) WHERE `kind` = 'chamber';
--> statement-breakpoint
ALTER TABLE `room_message` ADD `queued` integer DEFAULT 0 NOT NULL;
