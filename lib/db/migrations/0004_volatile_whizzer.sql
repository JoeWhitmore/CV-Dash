CREATE TABLE "closed_sprint_tickets" (
	"sprint_id" text NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"assignee_id" text,
	"captured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "closed_sprint_tickets_sprint_id_key_pk" PRIMARY KEY("sprint_id","key")
);
--> statement-breakpoint
ALTER TABLE "sprints" ADD COLUMN "closed_snapshot_captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "closed_sprint_tickets" ADD CONSTRAINT "closed_sprint_tickets_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closed_sprint_tickets" ADD CONSTRAINT "closed_sprint_tickets_assignee_id_team_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;