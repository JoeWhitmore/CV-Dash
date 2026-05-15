import {
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const sprints = pgTable("sprints", {
  id: text("id").primaryKey(), // jira sprint id (string-stable)
  name: text("name").notNull(),
  state: text("state").notNull(), // 'active' | 'future' | 'closed'
  startDate: date("start_date"),
  endDate: date("end_date"),
  baselinePoints: integer("baseline_points"),
  baselineCapturedAt: timestamp("baseline_captured_at", { withTimezone: true }),
  committedTicketKeys: text("committed_ticket_keys").array(),
  committedCapturedAt: timestamp("committed_captured_at", { withTimezone: true }),
  jiraBoardId: text("jira_board_id").notNull(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    id: text("id").primaryKey(), // slug of displayName
    jiraAccountId: text("jira_account_id").notNull(),
    name: text("name").notNull(),
    initials: text("initials").notNull(),
    avatarUrl: text("avatar_url"),
  },
  (t) => [uniqueIndex("team_members_jira_account_id_idx").on(t.jiraAccountId)],
);

export const tickets = pgTable("tickets", {
  key: text("key").primaryKey(), // 'CV-1300'
  title: text("title").notNull(),
  type: text("type").notNull(), // 'story' | 'bug' | 'task'
  status: text("status").notNull(), // mapped enum
  points: integer("points").notNull().default(0),
  assigneeId: text("assignee_id").references(() => teamMembers.id),
  sprintId: text("sprint_id")
    .notNull()
    .references(() => sprints.id),
  jiraUpdatedAt: timestamp("jira_updated_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull(),
});

export const burndownSnapshots = pgTable(
  "burndown_snapshots",
  {
    id: serial("id").primaryKey(),
    sprintId: text("sprint_id")
      .notNull()
      .references(() => sprints.id),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    remainingPoints: integer("remaining_points").notNull(),
    totalPoints: integer("total_points").notNull(),
  },
  (t) => [index("burndown_snapshots_sprint_captured_idx").on(t.sprintId, t.capturedAt)],
);

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(), // 'running' | 'success' | 'failed'
  ticketCount: integer("ticket_count"),
  sprintCount: integer("sprint_count"),
  errorMessage: text("error_message"),
});
