import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { projectBurndown } from "@/lib/burndown";
import type { BurndownPoint, Sprint, TeamMember, Ticket } from "@/lib/types";

export async function getSprints(): Promise<Sprint[]> {
  const rows = await db.select().from(schema.sprints);
  const ticketsForKeys = await db
    .select({ key: schema.tickets.key, sprintId: schema.tickets.sprintId })
    .from(schema.tickets);
  const keysBySprint = new Map<string, string[]>();
  for (const t of ticketsForKeys) {
    const arr = keysBySprint.get(t.sprintId) ?? [];
    arr.push(t.key);
    keysBySprint.set(t.sprintId, arr);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startDate: r.startDate ?? "",
    endDate: r.endDate ?? "",
    ticketKeys: keysBySprint.get(r.id) ?? [],
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
  const rows = await db
    .select()
    .from(schema.tickets)
    .where(eq(schema.tickets.sprintId, sprintId));
  return rows.map((r) => ({
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
      capturedAt: schema.burndownSnapshots.capturedAt,
      remainingPoints: schema.burndownSnapshots.remainingPoints,
    })
    .from(schema.burndownSnapshots)
    .where(eq(schema.burndownSnapshots.sprintId, sprintId))
    .orderBy(schema.burndownSnapshots.capturedAt);
  return projectBurndown({
    sprint: {
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      baselinePoints: sprint.baselinePoints,
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
