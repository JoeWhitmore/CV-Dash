CREATE TABLE "burndown_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"sprint_id" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"remaining_points" integer NOT NULL,
	"total_points" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprints" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"baseline_points" integer,
	"baseline_captured_at" timestamp with time zone,
	"jira_board_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"ticket_count" integer,
	"sprint_count" integer,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"jira_account_id" text NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"avatar_url" text
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"key" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"assignee_id" text,
	"sprint_id" text NOT NULL,
	"jira_updated_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "burndown_snapshots" ADD CONSTRAINT "burndown_snapshots_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_team_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "burndown_snapshots_sprint_captured_idx" ON "burndown_snapshots" USING btree ("sprint_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_jira_account_id_idx" ON "team_members" USING btree ("jira_account_id");