CREATE TABLE `loads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`load_number` text NOT NULL,
	`tender_id` integer NOT NULL,
	`status` text DEFAULT 'booked' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tender_id`) REFERENCES `tenders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loads_tender_unq` ON `loads` (`tender_id`);--> statement-breakpoint
CREATE TABLE `status_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`load_id` integer NOT NULL,
	`document_id` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`type` text NOT NULL,
	`code` text NOT NULL,
	`reason_code` text,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`time_code` text,
	`stop_sequence` integer,
	`location` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`load_id`) REFERENCES `loads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `synced_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `status_events_document_ordinal_unq` ON `status_events` (`document_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`cursor` text,
	`since` text NOT NULL,
	`last_run_at` text,
	`last_success_at` text,
	`last_error` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `synced_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_extid` text NOT NULL,
	`result_extid` text,
	`trace_guid` text,
	`direction` text NOT NULL,
	`outcome` text NOT NULL,
	`error_message` text,
	`partner` text,
	`transaction_set` text,
	`usage_indicator` text,
	`resend` integer DEFAULT false NOT NULL,
	`reference` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text,
	`raw_entry` text NOT NULL,
	`raw_document` text,
	`created_at` text NOT NULL,
	`synced_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `synced_documents_entry_extid_unq` ON `synced_documents` (`entry_extid`);--> statement-breakpoint
CREATE TABLE `tender_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tender_id` integer NOT NULL,
	`document_id` integer NOT NULL,
	`version` integer NOT NULL,
	`code` text NOT NULL,
	`load_number` text,
	`decline_reason` text,
	`date` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tender_id`) REFERENCES `tenders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `synced_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tender_responses_tender_version_unq` ON `tender_responses` (`tender_id`,`version`);--> statement-breakpoint
CREATE TABLE `tender_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tender_id` integer NOT NULL,
	`document_id` integer NOT NULL,
	`version` integer NOT NULL,
	`purpose` text NOT NULL,
	`tender` text NOT NULL,
	`respond_by` text,
	`received_at` text NOT NULL,
	FOREIGN KEY (`tender_id`) REFERENCES `tenders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `synced_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tender_versions_document_unq` ON `tender_versions` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tender_versions_tender_version_unq` ON `tender_versions` (`tender_id`,`version`);--> statement-breakpoint
CREATE TABLE `tenders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`partner` text NOT NULL,
	`tender_number` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`version` integer NOT NULL,
	`purpose` text NOT NULL,
	`tender` text NOT NULL,
	`shipper_name` text,
	`shipper_code` text,
	`origin_name` text,
	`origin_city` text,
	`origin_state` text,
	`destination_name` text,
	`destination_city` text,
	`destination_state` text,
	`pickup_at` text,
	`delivery_at` text,
	`weight` real,
	`weight_unit_code` text,
	`handling_units` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenders_partner_number_unq` ON `tenders` (`partner`,`tender_number`);