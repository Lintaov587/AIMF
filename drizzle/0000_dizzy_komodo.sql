CREATE TABLE `commands` (
	`id` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `commands_session` ON `commands` (`session`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`ai_hash` text NOT NULL,
	`owner` text,
	`ai_owner` text,
	`state` text NOT NULL,
	`active_command` text,
	`last_seen` integer NOT NULL,
	`expires` integer NOT NULL
);
