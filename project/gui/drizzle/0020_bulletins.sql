CREATE TABLE `bulletin` (
  `id` text PRIMARY KEY NOT NULL,
  `body` text NOT NULL DEFAULT '',
  `x` real NOT NULL CHECK (`x` >= 0 AND `x` <= 1),
  `y` real NOT NULL CHECK (`y` >= 0 AND `y` <= 1),
  `created_by` text NOT NULL REFERENCES `user`(`id`),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bulletin_updated_at_idx` ON `bulletin` (`updated_at`);
