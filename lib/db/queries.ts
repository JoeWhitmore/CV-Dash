import { desc, eq, inArray } from "drizzle-orm";
import { projectBurndown } from "@/lib/burndown";
import { db, schema } from "@/lib/db";
import type { BurndownPoint, Sprint, TeamMember, Ticket } from "@/lib/types";

export async function getSprints(): Promise<Sprint[]> {
  const rows = await db.select().from(schema.sprints);

  // Active/future sprints: roster comes from live `tickets` (current sprintId).
  // Closed sprints: roster comes from the frozen close-time snapshot — using live `tickets`
  // would lose tickets that were carried over to a newer sprint and had their sprintId
  // overwritten by the carry-over upsert.
  const liveKeyRows = await db
    .select({ key: schema.tickets.key, sprintId: schema.tickets.sprintId })
    .from(schema.tickets);
  const liveBySprint = new Map<string, string[]>();
  for (const t of liveKeyRows) {
    const arr = liveBySprint.get(t.sprintId) ?? [];
    arr.push(t.key);
    liveBySprint.set(t.sprintId, arr);
  }

  const snapshotKeyRows = await db
    .select({ key: schema.closedSprintTickets.key, sprintId: schema.closedSprintTickets.sprintId })
    .from(schema.closedSprintTickets);
  const snapshotBySprint = new Map<string, string[]>();
  for (const t of snapshotKeyRows) {
    const arr = snapshotBySprint.get(t.sprintId) ?? [];
    arr.push(t.key);
    snapshotBySprint.set(t.sprintId, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startDate: r.startDate ?? "",
    endDate: r.endDate ?? "",
    ticketKeys:
      r.state === "closed" ? (snapshotBySprint.get(r.id) ?? []) : (liveBySprint.get(r.id) ?? []),
    committedTicketKeys: r.committedTicketKeys ?? null,
  }));
}

export async function getCurrentSprintId(): Promise<string | null> {
  const [active] = await db
    .select({ id: schema.sprints.id })
    .from(schema.sprints)
    .where(eq(schema.sprints.state, "active"))
    .limit(1);
  return active?.id ?? null;
}

export async function getTickets(sprintId: string): Promise<Ticket[]> {
  const [sprint] = await db
    .select({
      state: schema.sprints.state,
      committedTicketKeys: schema.sprints.committedTicketKeys,
    })
    .from(schema.sprints)
    .where(eq(schema.sprints.id, sprintId))
    .limit(1);

  if (sprint?.state === "closed") {
    const rows = await db
      .select()
      .from(schema.closedSprintTickets)
      .where(eq(schema.closedSprintTickets.sprintId, sprintId));
    return rows.map((r) => ({
      key: r.key,
      title: r.title,
      type: r.type as Ticket["type"],
      status: r.status as Ticket["status"],
      points: r.points,
      assigneeId: r.assigneeId ?? "",
    }));
  }

  // Live tickets currently assigned to this sprint.
  const liveRows = await db
    .select()
    .from(schema.tickets)
    .where(eq(schema.tickets.sprintId, sprintId));

  // Plus any frozen-committed tickets that have since been moved out — without these,
  // both pointsCommitted and pointsToPr in sprintKpis would silently shrink and the
  // ratio would stay at 100%.
  const liveKeys = new Set(liveRows.map((r) => r.key));
  const missingCommitted =
    sprint?.committedTicketKeys?.filter((k) => !liveKeys.has(k)) ?? [];
  const movedOutRows =
    missingCommitted.length > 0
      ? await db.select().from(schema.tickets).where(inArray(schema.tickets.key, missingCommitted))
      : [];

  return [...liveRows, ...movedOutRows].map((r) => ({
    key: r.key,
    title: r.title,
    type: r.type as Ticket["type"],
    status: r.status as Ticket["status"],
    points: r.points,
    assigneeId: r.assigneeId ?? "",
  }));
}

export async function getTeam(): Promise<TeamMember[]> {
  const rows = await db.select().from(schema.teamMembers);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    initials: r.initials,
    avatarUrl: r.avatarUrl ?? undefined,
  }));
}

export async function getBurndown(sprintId: string): Promise<BurndownPoint[]> {
  const [sprint] = await db
    .select()
    .from(schema.sprints)
    .where(eq(schema.sprints.id, sprintId))
    .limit(1);
  if (!sprint) return [];
  const snapshots = await db
    .select({
      forDate: schema.burndownSnapshots.forDate,
      remainingPoints: schema.burndownSnapshots.remainingPoints,
      committedRemainingPoints: schema.burndownSnapshots.committedRemainingPoints,
    })
    .from(schema.burndownSnapshots)
    .where(eq(schema.burndownSnapshots.sprintId, sprintId))
    .orderBy(schema.burndownSnapshots.forDate);

  // committed baseline = current sum of points for tickets in the frozen set. Re-estimates
  // of committed tickets flow through (matching pointsCommitted semantics in sprintKpis).
  // For closed sprints we read from the close-time snapshot — `tickets` may have lost rows
  // to carry-over upserts that reassigned sprintId to the next sprint.
  let committedBaselinePoints: number | null = null;
  if (sprint.committedTicketKeys && sprint.committedTicketKeys.length > 0) {
    const committedSet = new Set(sprint.committedTicketKeys);
    const rows =
      sprint.state === "closed"
        ? await db
            .select({
              key: schema.closedSprintTickets.key,
              points: schema.closedSprintTickets.points,
            })
            .from(schema.closedSprintTickets)
            .where(eq(schema.closedSprintTickets.sprintId, sprintId))
        : await db
            .select({ key: schema.tickets.key, points: schema.tickets.points })
            .from(schema.tickets)
            .where(eq(schema.tickets.sprintId, sprintId));
    committedBaselinePoints = rows
      .filter((t) => committedSet.has(t.key))
      .reduce((sum, t) => sum + t.points, 0);
  }

  return projectBurndown({
    sprint: {
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      baselinePoints: sprint.baselinePoints,
      committedBaselinePoints,
    },
    snapshots,
  });
}

export async function getLastSyncedAt(): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: schema.syncRuns.finishedAt })
    .from(schema.syncRuns)
    .where(eq(schema.syncRuns.status, "success"))
    .orderBy(desc(schema.syncRuns.finishedAt))
    .limit(1);
  return row?.finishedAt ?? null;
}
