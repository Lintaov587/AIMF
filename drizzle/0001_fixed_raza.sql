CREATE TABLE `leaderboard` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`name` text NOT NULL,
	`elapsed_ms` integer NOT NULL,
	`moves` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leaderboard_mode_time` ON `leaderboard` (`mode`,`elapsed_ms`);