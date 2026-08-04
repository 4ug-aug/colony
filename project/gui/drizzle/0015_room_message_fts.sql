CREATE VIRTUAL TABLE `room_message_fts` USING fts5(
	`text`,
	content=`room_message`,
	content_rowid=`rowid`
);
--> statement-breakpoint
CREATE TRIGGER `room_message_ai` AFTER INSERT ON `room_message` BEGIN
	INSERT INTO `room_message_fts`(`rowid`, `text`) VALUES (new.`rowid`, new.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `room_message_ad` AFTER DELETE ON `room_message` BEGIN
	INSERT INTO `room_message_fts`(`room_message_fts`, `rowid`, `text`) VALUES('delete', old.`rowid`, old.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `room_message_au` AFTER UPDATE OF `text` ON `room_message` BEGIN
	INSERT INTO `room_message_fts`(`room_message_fts`, `rowid`, `text`) VALUES('delete', old.`rowid`, old.`text`);
	INSERT INTO `room_message_fts`(`rowid`, `text`) VALUES (new.`rowid`, new.`text`);
END;
--> statement-breakpoint
INSERT INTO `room_message_fts`(`rowid`, `text`) SELECT `rowid`, `text` FROM `room_message`;
