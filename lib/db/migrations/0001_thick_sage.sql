ALTER TABLE "sprints" ADD COLUMN "committed_ticket_keys" text[];--> statement-breakpoint
ALTER TABLE "sprints" ADD COLUMN "committed_captured_at" timestamp with time zone;