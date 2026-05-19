import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
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
  closedSnapshotCapturedAt: timestamp("closed_snapshot_captured_at", { withTimezone: true }),
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
    forDate: date("for_date").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    remainingPoints: integer("remaining_points").notNull(),
    totalPoints: integer("total_points").notNull(),
    committedRemainingPoints: integer("committed_remaining_points"),
  },
  (t) => [
    index("burndown_snapshots_sprint_captured_idx").on(t.sprintId, t.capturedAt),
    uniqueIndex("burndown_snapshots_sprint_for_date_idx").on(t.sprintId, t.forDate),
  ],
);

/**
 * Frozen snapshot of a sprint's ticket roster at the moment the sprint closed. Mirrors the
 * `tickets` shape (title, type, status, points, assigneeId) but composite-keyed on
 * (sprint_id, key), so the same ticket can have snapshots in multiple closed sprints (e.g.
 * a ticket that spans two sprints because it was re-opened). Read by `getTickets` /
 * `getSprints` / `getBurndown` for any sprint whose state is 'closed'.
 */
export const closedSprintTickets = pgTable(
  "closed_sprint_tickets",
  {
    sprintId: text("sprint_id")
      .notNull()
      .references(() => sprints.id),
    key: text("key").notNull(),
    title: text("title").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(), // status at sprint endDate
    points: integer("points").notNull().default(0),
    assigneeId: text("assignee_id").references(() => teamMembers.id),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.sprintId, t.key] })],
);

/**
 * Project-wide epic catalogue. Independent of sprint membership — we track every epic in CV
 * regardless of which sprint (if any) its children live in. Status is the raw Jira status name
 * (e.g. "Discovery", "Building", "In QA"); the client maps it to the user-facing label via
 * EPIC_STAGES in epics-panel.tsx. ticketCount is the total number of child issues; assignees
 * (the unique set of people working under the epic) lives in epic_assignees.
 */
export const epics = pgTable("epics", {
  key: text("key").primaryKey(), // 'CV-5423'
  title: text("title").notNull(),
  status: text("status").notNull(), // raw Jira status string
  ticketCount: integer("ticket_count").notNull().default(0),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull(),
});

export const epicAssignees = pgTable(
  "epic_assignees",
  {
    epicKey: text("epic_key")
      .notNull()
      .references(() => epics.key, { onDelete: "cascade" }),
    assigneeId: text("assignee_id")
      .notNull()
      .references(() => teamMembers.id),
  },
  (t) => [primaryKey({ columns: [t.epicKey, t.assigneeId] })],
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
