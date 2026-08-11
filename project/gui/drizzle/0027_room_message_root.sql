ALTER TABLE `room_message` ADD `root_id` text REFERENCES `room_message`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX `room_message_root_idx` ON `room_message` (`root_id`);
