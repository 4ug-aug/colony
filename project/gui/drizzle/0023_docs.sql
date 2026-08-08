CREATE TABLE `doc` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL DEFAULT '',
  `body` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL REFERENCES `user`(`id`),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `doc_updated_at_idx` ON `doc` (`updated_at`);
