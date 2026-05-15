DELETE FROM "burndown_snapshots";--> statement-breakpoint
ALTER TABLE "burndown_snapshots" ADD COLUMN "for_date" date NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "burndown_snapshots_sprint_for_date_idx" ON "burndown_snapshots" USING btree ("sprint_id","for_date");