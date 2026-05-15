"use server";

import { sql, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  fetchIssueChangelog,
  jiraConfigFromEnv,
} from "@/lib/jira/client";
import { mapJiraStatus } from "@/lib/jira/status-map";
import { statusAtTime } from "@/lib/jira/status-history";
import { endOfWorkingDay } from "@/lib/sprint/working-day-end";
import { enumerateWorkingDays } from "@/lib/working-days";

const REMAINING = new Set(["to-do", "in-progress", "in-review"]);

export interface BackfillResult {
  ok: boolean;
  sprintId?: string;
  daysComputed?: number;
  ticketsProcessed?: number;
  error?: string;
}

/**
 * Reconstructs per-working-day burndown snapshots for a sprint by replaying each
 * ticket's status changelog. Idempotent: re-running overwrites existing rows for
 * the sprint by (sprint_id, for_date).
 *
 * Limited to working days up to and including TODAY — we don't synthesize future days.
 */
export async function backfillBurndown(sprintId: string): Promise<BackfillResult> {
  const cfg = jiraConfigFromEnv();

  const [sprint] = await db
    .select()
    .from(schema.sprints)
    .where(eq(schema.sprints.id, sprintId))
    .limit(1);
  if (!sprint) return { ok: false, error: `Sprint ${sprintId} not found` };
  if (!sprint.startDate || !sprint.endDate) {
    return { ok: false, error: `Sprint ${sprintId} has no dates` };
  }

  const tickets = await db
    .select({ key: schema.tickets.key, points: schema.tickets.points, status: schema.tickets.status })
    .from(schema.tickets)
    .where(eq(schema.tickets.sprintId, sprintId));

  // Fetch changelogs in parallel with concurrency cap.
  const CONCURRENCY = 8;
  const changelogs = new Map<string, { changelog: Awaited<ReturnType<typeof fetchIssueChangelog>>["values"]; currentStatus: string; points: number }>();
  const queue = [...tickets];
  await Promise.all(
    Array.from({ length: CONCURRENCY }).map(async () => {
      while (queue.length > 0) {
        const t = queue.shift();
        if (!t) break;
        const resp = await fetchIssueChangelog(cfg, t.key);
        // The DB `status` is the mapped domain enum; we need the raw Jira status name as of "now"
        // to seed statusAtTime. Since the changelog's most recent status `toString` is the current
        // value, we can derive it from the last status change. If no status change ever happened,
        // we'd need to fall back — but in practice every CV ticket has at least an initial transition.
        const lastStatusChange = resp.values
          .filter((h) => h.items.some((i) => i.field === "status"))
          .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())[0];
        const currentRawStatus = lastStatusChange
          ? (lastStatusChange.items.find((i) => i.field === "status")?.toString ?? "")
          : ""; // no status changes ever — treat as still in initial status; we don't know its raw name
        changelogs.set(t.key, { changelog: resp.values, currentStatus: currentRawStatus, points: t.points });
      }
    }),
  );

  // Compute one snapshot per working day from sprint start through today.
  const todayIso = new Date().toISOString().slice(0, 10);
  const startIso = sprint.startDate < todayIso ? sprint.startDate : todayIso;
  const endIso = sprint.endDate < todayIso ? sprint.endDate : todayIso;
  const workingDays = enumerateWorkingDays(startIso, endIso);

  const rows: Array<typeof schema.burndownSnapshots.$inferInsert> = [];
  for (const day of workingDays) {
    const cutoff = endOfWorkingDay(day);
    let remaining = 0;
    let total = 0;
    for (const t of tickets) {
      const entry = changelogs.get(t.key);
      if (!entry) continue;
      const rawAt = statusAtTime({
        changelog: entry.changelog,
        currentStatus: entry.currentStatus,
        at: cutoff,
      });
      // Skip tickets with no known raw status at that time (very rare — pre-creation).
      if (!rawAt) continue;
      const mapped = mapJiraStatus(rawAt);
      total += t.points;
      if (REMAINING.has(mapped.status)) remaining += t.points;
    }
    rows.push({ sprintId, forDate: day, remainingPoints: remaining, totalPoints: total });
  }

  if (rows.length === 0) {
    return { ok: true, sprintId, daysComputed: 0, ticketsProcessed: tickets.length };
  }

  await db
    .insert(schema.burndownSnapshots)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.burndownSnapshots.sprintId, schema.burndownSnapshots.forDate],
      set: {
        remainingPoints: sql`excluded.remaining_points`,
        totalPoints: sql`excluded.total_points`,
        capturedAt: sql`now()`,
      },
    });

  return { ok: true, sprintId, daysComputed: rows.length, ticketsProcessed: tickets.length };
}
