"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt, inArray, notInArray } from "drizzle-orm";
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
  const cfg = jiraConfigFromEnv();
  const [run] = await db.insert(schema.syncRuns).values({ status: "running" }).returning({ id: schema.syncRuns.id });

  const sprintsResp = await fetchActiveAndFutureSprints(cfg);
  const parsedSprints = parseSprintList(sprintsResp);

  const allIssues = await Promise.all(
    parsedSprints.map((s) => fetchIssuesForSprint(cfg, s.id)),
  );
  const warnings: string[] = [];
  const parsedTickets = [];
  const parsedAssignees = [];
  // Parallel arrays: parsedSprints[i] corresponds to allIssues[i]. We pass sprint.id
  // explicitly into the parser because a Jira issue's customfield_10020 array can list
  // many sprints and the ordering is not reliably "active last".
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
    for (const s of write.sprintUpserts) {
      await tx
        .insert(schema.sprints)
        .values(s)
        .onConflictDoUpdate({
          target: schema.sprints.id,
          set: {
            name: s.name,
            state: s.state,
            startDate: s.startDate,
            endDate: s.endDate,
            baselinePoints: s.baselinePoints,
            baselineCapturedAt: s.baselineCapturedAt,
            jiraBoardId: s.jiraBoardId,
          },
        });
    }

    for (const m of write.teamUpserts) {
      await tx
        .insert(schema.teamMembers)
        .values(m)
        .onConflictDoUpdate({
          target: schema.teamMembers.jiraAccountId,
          set: { id: m.id, name: m.name, initials: m.initials, avatarUrl: m.avatarUrl },
        });
    }

    for (const t of write.ticketUpserts) {
      await tx
        .insert(schema.tickets)
        .values(t)
        .onConflictDoUpdate({
          target: schema.tickets.key,
          set: {
            title: t.title,
            type: t.type,
            status: t.status,
            points: t.points,
            assigneeId: t.assigneeId,
            sprintId: t.sprintId,
            jiraUpdatedAt: t.jiraUpdatedAt,
            lastSyncedAt: t.lastSyncedAt,
          },
        });
    }

    if (write.activeSprintIds.length > 0) {
      await tx
        .delete(schema.tickets)
        .where(
          and(
            notInArray(schema.tickets.key, write.activeTicketKeys.length > 0 ? write.activeTicketKeys : [""]),
            inArray(schema.tickets.sprintId, write.activeSprintIds),
          ),
        );
    }

    for (const snap of write.burndownSnapshots) {
      await tx.insert(schema.burndownSnapshots).values(snap);
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
}
