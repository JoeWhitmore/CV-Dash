"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  jiraConfigFromEnv,
  fetchActiveAndFutureSprints,
  fetchIssueChangelog,
  fetchIssuesForSprint,
} from "@/lib/jira/client";
import { parseIssueIntoTicket, parseSprintList } from "@/lib/jira/parsers";
import { deriveTeam } from "@/lib/sync/team-derivation";
import { buildSyncWrite } from "@/lib/sync/reducer";
import { committedCutoff } from "@/lib/sprint/cutoff";
import { statusAtTime, wasInSprintAt } from "@/lib/jira/sprint-history";
import { mapJiraStatus } from "@/lib/jira/status-map";
import { enumerateWorkingDays } from "@/lib/working-days";
import type { JiraChangelogEntry, JiraIssue } from "@/lib/jira/types";

const REMAINING_STATUSES_FOR_BURNDOWN = new Set(["to-do", "in-progress", "in-review"]);

/**
 * End-of-working-day Brisbane (UTC+10) as a UTC Date. e.g. "2026-05-11" → 2026-05-11 24:00 +10:00
 * = 2026-05-11 14:00 UTC. Used to evaluate "what was the status at end of working day D".
 */
function endOfDayBrisbane(forDate: string): Date {
  return new Date(`${forDate}T14:00:00Z`);
}

export interface SyncResult {
  ok: boolean;
  syncedTickets?: number;
  syncedSprints?: number;
  lastSyncedAt?: string;
  warnings?: string[];
  error?: string;
}

export async function syncFromJira(): Promise<SyncResult> {
  // Concurrent guard
  const inFlight = await db
    .select({ id: schema.syncRuns.id })
    .from(schema.syncRuns)
    .where(
      and(
        eq(schema.syncRuns.status, "running"),
        gt(schema.syncRuns.startedAt, new Date(Date.now() - 60_000)),
      ),
    );
  if (inFlight.length > 0) {
    return { ok: false, error: "Sync already in progress. Try again in a minute." };
  }

  let cfg;
  try {
    cfg = jiraConfigFromEnv();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const [run] = await db
    .insert(schema.syncRuns)
    .values({ status: "running" })
    .returning({ id: schema.syncRuns.id });

  try {
    const sprintsResp = await fetchActiveAndFutureSprints(cfg);
    const parsedSprints = parseSprintList(sprintsResp);

    const allIssues = await Promise.all(
      parsedSprints.map((s) => fetchIssuesForSprint(cfg, s.id)),
    );
    const warnings: string[] = [];
    const parsedTickets = [];
    const parsedAssignees = [];
    for (let i = 0; i < parsedSprints.length; i++) {
      const sprintId = parsedSprints[i].id;
      for (const issue of allIssues[i].issues) {
        const result = parseIssueIntoTicket(issue, sprintId, { pointsField: cfg.pointsField });
        parsedTickets.push(result.ticket);
        parsedAssignees.push(result.assignee);
        warnings.push(...result.warnings);
      }
    }

    const team = deriveTeam(parsedAssignees);

    const existingSprintRows = await db.select().from(schema.sprints);
    const existingBaselines = new Map(
      existingSprintRows
        .filter((s) => s.baselinePoints != null && s.baselineCapturedAt != null)
        .map((s) => [s.id, { baselinePoints: s.baselinePoints!, baselineCapturedAt: s.baselineCapturedAt! }]),
    );

    const existingCommitments = new Map(
      existingSprintRows
        .filter((s) => s.committedTicketKeys != null && s.committedCapturedAt != null)
        .map((s) => [s.id, { ticketKeys: s.committedTicketKeys!, capturedAt: s.committedCapturedAt! }]),
    );

    const now = new Date();

    // For each sprint past its Monday 8AM Brisbane cutoff with no existing commitment, reconstruct
    // the ticket set that was in the sprint at cutoff using each ticket's Jira changelog. While we
    // have the changelogs in memory, also reconstruct historical committed_remaining per working
    // day so the burndown's actual line has accurate values from day 1.
    const commitmentFreezes = new Map<string, string[]>();
    const historicalCommittedRemaining: Array<{ sprintId: string; forDate: string; value: number }> = [];

    for (let i = 0; i < parsedSprints.length; i++) {
      const s = parsedSprints[i];
      if (existingCommitments.has(s.id)) continue;
      const cutoff = committedCutoff(s.startDate);
      if (!cutoff || now.getTime() < cutoff.getTime()) continue;

      const sprintIssues = allIssues[i].issues;
      const committedKeys: string[] = [];
      const ticketChangelogs = new Map<string, JiraChangelogEntry[]>();
      const ticketByKey = new Map<string, JiraIssue>();

      // One-time per sprint: this loop is skipped on all subsequent syncs once
      // committedTicketKeys is persisted (see the `existingCommitments.has(...)` check above).
      for (const issue of sprintIssues) {
        const changelogResp = await fetchIssueChangelog(cfg, issue.key);
        ticketChangelogs.set(issue.key, changelogResp.values);
        ticketByKey.set(issue.key, issue);
        const inAtCutoff = wasInSprintAt({
          sprintId: s.id,
          issueCreated: issue.fields.created,
          changelog: changelogResp.values,
          at: cutoff,
        });
        if (inAtCutoff) committedKeys.push(issue.key);
      }
      commitmentFreezes.set(s.id, committedKeys);

      // Replay each working day: for each committed ticket, ask the changelog what its status was
      // at end-of-day Brisbane. Sum points for tickets that were in remaining-statuses at that
      // moment. Cap at today (don't pre-populate future days).
      if (s.startDate && s.endDate) {
        const days = enumerateWorkingDays(s.startDate, s.endDate);
        const todayKey = now.toISOString().slice(0, 10);
        for (const day of days) {
          if (day > todayKey) break;
          let value = 0;
          for (const key of committedKeys) {
            const issue = ticketByKey.get(key);
            const cl = ticketChangelogs.get(key);
            if (!issue || !cl) continue;
            const points = Number((issue.fields as Record<string, unknown>)[cfg.pointsField] ?? 0);
            const status = statusAtTime({
              currentStatus: mapJiraStatus(issue.fields.status.name).status,
              changelog: cl,
              at: endOfDayBrisbane(day),
            });
            if (REMAINING_STATUSES_FOR_BURNDOWN.has(status)) value += points;
          }
          historicalCommittedRemaining.push({ sprintId: s.id, forDate: day, value });
        }
      }
    }

    const write = buildSyncWrite({
      sprints: parsedSprints,
      tickets: parsedTickets,
      assignees: team,
      existingBaselines,
      existingCommitments,
      commitmentFreezes,
      now,
    });

    await db.transaction(async (tx) => {
      if (write.sprintUpserts.length > 0) {
        await tx.insert(schema.sprints).values(write.sprintUpserts).onConflictDoUpdate({
          target: schema.sprints.id,
          set: {
            name: sql`excluded.name`,
            state: sql`excluded.state`,
            startDate: sql`excluded.start_date`,
            endDate: sql`excluded.end_date`,
            baselinePoints: sql`excluded.baseline_points`,
            baselineCapturedAt: sql`excluded.baseline_captured_at`,
            committedTicketKeys: sql`excluded.committed_ticket_keys`,
            committedCapturedAt: sql`excluded.committed_captured_at`,
            jiraBoardId: sql`excluded.jira_board_id`,
          },
        });
      }
      if (write.teamUpserts.length > 0) {
        await tx.insert(schema.teamMembers).values(write.teamUpserts).onConflictDoUpdate({
          target: schema.teamMembers.jiraAccountId,
          set: {
            id: sql`excluded.id`,
            name: sql`excluded.name`,
            initials: sql`excluded.initials`,
            avatarUrl: sql`excluded.avatar_url`,
          },
        });
      }
      if (write.ticketUpserts.length > 0) {
        await tx.insert(schema.tickets).values(write.ticketUpserts).onConflictDoUpdate({
          target: schema.tickets.key,
          set: {
            title: sql`excluded.title`,
            type: sql`excluded.type`,
            status: sql`excluded.status`,
            points: sql`excluded.points`,
            assigneeId: sql`excluded.assignee_id`,
            sprintId: sql`excluded.sprint_id`,
            jiraUpdatedAt: sql`excluded.jira_updated_at`,
            lastSyncedAt: sql`excluded.last_synced_at`,
          },
        });
      }
      if (write.activeSprintIds.length > 0) {
        await tx.delete(schema.tickets).where(
          and(
            notInArray(schema.tickets.key, write.activeTicketKeys.length > 0 ? write.activeTicketKeys : [""]),
            inArray(schema.tickets.sprintId, write.activeSprintIds),
          ),
        );
      }
      if (write.burndownSnapshots.length > 0) {
        await tx.insert(schema.burndownSnapshots).values(write.burndownSnapshots).onConflictDoUpdate({
          target: [schema.burndownSnapshots.sprintId, schema.burndownSnapshots.forDate],
          set: {
            remainingPoints: sql`excluded.remaining_points`,
            totalPoints: sql`excluded.total_points`,
            committedRemainingPoints: sql`excluded.committed_remaining_points`,
            capturedAt: sql`excluded.captured_at`,
          },
        });
      }

      // Backfill historical committed_remaining_points on past snapshots when this run is freshly
      // freezing a sprint. We update existing rows only; we don't manufacture snapshots for days
      // the team never synced. The reducer's snapshot for `now.forDate` is already correct above.
      for (const h of historicalCommittedRemaining) {
        await tx
          .update(schema.burndownSnapshots)
          .set({ committedRemainingPoints: h.value })
          .where(
            and(
              eq(schema.burndownSnapshots.sprintId, h.sprintId),
              eq(schema.burndownSnapshots.forDate, h.forDate),
            ),
          );
      }
    });

    const finishedAt = new Date();
    await db
      .update(schema.syncRuns)
      .set({
        status: "success",
        finishedAt,
        ticketCount: write.ticketUpserts.length,
        sprintCount: write.sprintUpserts.length,
        errorMessage: warnings.length ? warnings.join("\n") : null,
      })
      .where(eq(schema.syncRuns.id, run.id));

    revalidatePath("/dashboard");
    return {
      ok: true,
      syncedTickets: write.ticketUpserts.length,
      syncedSprints: write.sprintUpserts.length,
      lastSyncedAt: finishedAt.toISOString(),
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.syncRuns)
      .set({ status: "failed", finishedAt: new Date(), errorMessage: message })
      .where(eq(schema.syncRuns.id, run.id));
    return { ok: false, error: message };
  }
}
