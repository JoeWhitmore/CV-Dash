"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { jiraConfigFromEnv, fetchActiveAndFutureSprints, fetchIssuesForSprint } from "@/lib/jira/client";
import { parseIssueIntoTicket, parseSprintList } from "@/lib/jira/parsers";
import { deriveTeam } from "@/lib/sync/team-derivation";
import { buildSyncWrite } from "@/lib/sync/reducer";

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

    const write = buildSyncWrite({
      sprints: parsedSprints,
      tickets: parsedTickets,
      assignees: team,
      existingBaselines,
      now: new Date(),
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
        await tx.insert(schema.burndownSnapshots).values(write.burndownSnapshots);
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
