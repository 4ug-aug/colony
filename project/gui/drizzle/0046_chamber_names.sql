-- Chambers are named after their agent, so many share a name; keep names unique among Rooms only.
DROP INDEX `room_name_nocase_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `room_name_nocase_unique` ON `room` (`name` COLLATE NOCASE) WHERE `kind` = 'room';
