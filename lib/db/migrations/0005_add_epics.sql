CREATE TABLE "epic_assignees" (
	"epic_key" text NOT NULL,
	"assignee_id" text NOT NULL,
	CONSTRAINT "epic_assignees_epic_key_assignee_id_pk" PRIMARY KEY("epic_key","assignee_id")
);
--> statement-breakpoint
CREATE TABLE "epics" (
	"key" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"ticket_count" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "epic_assignees" ADD CONSTRAINT "epic_assignees_epic_key_epics_key_fk" FOREIGN KEY ("epic_key") REFERENCES "public"."epics"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epic_assignees" ADD CONSTRAINT "epic_assignees_assignee_id_team_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;