"use server";

import { and, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import {
  fetchActiveAndFutureSprints,
  fetchAllEpics,
  fetchEpicChildren,
  fetchIssueByKey,
  fetchIssueChangelog,
  fetchIssuesForSprint,
  jiraConfigFromEnv,
} from "@/lib/jira/client";
import {
  type ParsedAssignee,
  parseEpic,
  parseEpicChild,
  parseIssueIntoTicket,
  parseSprintList,
} from "@/lib/jira/parsers";
import { statusAtTime, wasInSprintAt } from "@/lib/jira/sprint-history";
import { mapJiraStatus } from "@/lib/jira/status-map";
import type { JiraChangelogEntry, JiraIssue } from "@/lib/jira/types";
import {
  buildClosedSprintBurndownSnapshot,
  buildClosedSprintSnapshot,
  type CloseBurndownSnapshot,
  type CloseSnapshotCandidate,
} from "@/lib/sync/close-snapshot";
import { buildSyncWrite, REMAINING_STATUSES } from "@/lib/sync/reducer";
import { deriveTeam } from "@/lib/sync/team-derivation";
import { enumerateWorkingDays } from "@/lib/working-days";

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

    const allIssues = await Promise.all(parsedSprints.map((s) => fetchIssuesForSprint(cfg, s.id)));
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

    const now = new Date();

    // Fetch the project-wide epic catalogue + every child issue under those epics. Done outside
    // the sprint loop because epics live independently of sprint membership (an epic in "Building"
    // may have no children in the active sprint).
    const projectKey = parsedTickets[0]?.key.split("-")[0] ?? "CV";
    const epicsResp = await fetchAllEpics(cfg, projectKey);
    const parsedEpics = epicsResp.issues.map(parseEpic);
    const childIssues = await fetchEpicChildren(
      cfg,
      projectKey,
      parsedEpics.map((e) => e.key),
    );
    const parsedChildren = childIssues.map(parseEpicChild);

    // Merge child-ticket assignees into the team derivation. Without this, anyone working only on
    // tickets outside the active/future sprints would be missing from team_members, and the
    // epic_assignees insert below would fail its FK check.
    const childAssignees = parsedChildren
      .map((c) => c.assignee)
      .filter((a): a is ParsedAssignee => a !== null);
    const team = deriveTeam([...parsedAssignees, ...childAssignees]);

    // Group children by epic + compute per-epic ticket count and unique assignee set.
    // Assignee set excludes children in terminal Jira statuses so retired-ticket assignees fall
    // off the card. Ticket count is total scope (all children) — matches the user's intent of
    // "how big is this epic".
    const TERMINAL_CHILD_STATUSES = new Set(["Done", "Closed"]);
    const childrenByEpic = new Map<string, typeof parsedChildren>();
    for (const c of parsedChildren) {
      if (!c.epicKey) continue;
      const arr = childrenByEpic.get(c.epicKey) ?? [];
      arr.push(c);
      childrenByEpic.set(c.epicKey, arr);
    }

    const epicUpserts = parsedEpics.map((e) => ({
      key: e.key,
      title: e.title,
      status: e.status,
      ticketCount: (childrenByEpic.get(e.key) ?? []).length,
      lastSyncedAt: now,
    }));

    const epicAssigneeRows: { epicKey: string; assigneeId: string }[] = [];
    for (const e of parsedEpics) {
      const children = childrenByEpic.get(e.key) ?? [];
      const ids = new Set<string>();
      for (const c of children) {
        if (TERMINAL_CHILD_STATUSES.has(c.childStatus)) continue;
        if (c.assignee) ids.add(c.assignee.id);
      }
      for (const id of ids) {
        epicAssigneeRows.push({ epicKey: e.key, assigneeId: id });
      }
    }

    const activeEpicKeys = parsedEpics.map((e) => e.key);

    const existingSprintRows = await db.select().from(schema.sprints);
    const existingBaselines = new Map(
      existingSprintRows
        .filter((s) => s.baselinePoints != null && s.baselineCapturedAt != null)
        .map((s) => [
          s.id,
          { baselinePoints: s.baselinePoints!, baselineCapturedAt: s.baselineCapturedAt! },
        ]),
    );

    const existingCommitments = new Map(
      existingSprintRows
        .filter((s) => s.committedTicketKeys != null && s.committedCapturedAt != null)
        .map((s) => [
          s.id,
          { ticketKeys: s.committedTicketKeys!, capturedAt: s.committedCapturedAt! },
        ]),
    );

    // For each sprint past its Monday 8AM Brisbane cutoff with no existing commitment, reconstruct
    // the ticket set that was in the sprint at cutoff using each ticket's Jira changelog. While we
    // have the changelogs in memory, also reconstruct historical committed_remaining per working
    // day so the burndown's actual line has accurate values from day 1.
    const commitmentFreezes = new Map<string, string[]>();
    const historicalCommittedRemaining: Array<{
      sprintId: string;
      forDate: string;
      value: number;
    }> = [];

    for (let i = 0; i < parsedSprints.length; i++) {
      const s = parsedSprints[i];
      if (existingCommitments.has(s.id)) continue;
      // Cutoff = the exact moment Jira reports the sprint as started (i.e. when "Start Sprint"
      // was clicked). Anything in the sprint AND in to-do/in-progress/blocked at that instant
      // is committed. Skipping when now is before startedAt means future sprints don't freeze.
      const cutoff = s.startedAt;
      if (!cutoff || now.getTime() < cutoff.getTime()) continue;

      const sprintIssues = allIssues[i].issues;
      const committedKeys: string[] = [];
      const ticketChangelogs = new Map<string, JiraChangelogEntry[]>();
      const ticketByKey = new Map<string, JiraIssue>();

      // One-time per sprint: this loop is skipped on all subsequent syncs once
      // committedTicketKeys is persisted (see the `existingCommitments.has(...)` check above).
      // A ticket joins the committed set iff it was both (a) in the sprint at the cutoff and
      // (b) in a "remaining" status (to-do / in-progress / blocked) at the cutoff. Carryover
      // tickets that arrived already in peer-review / testing / done / closed are excluded —
      // they weren't newly committed to this sprint.
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
        if (!inAtCutoff) continue;
        const statusAtCutoff = statusAtTime({
          currentStatus: mapJiraStatus(issue.fields.status.name).status,
          changelog: changelogResp.values,
          at: cutoff,
        });
        if (REMAINING_STATUSES.has(statusAtCutoff)) committedKeys.push(issue.key);
      }
      commitmentFreezes.set(s.id, committedKeys);

      // Replay each working day's morning state: snapshot for day D = end of day D-1 Brisbane.
      // Day 0 (Monday) is skipped — projectBurndown anchors it to committedBaselinePoints by
      // burndown convention ("all committed work is remaining at sprint start"). Today's snapshot
      // is also skipped because the reducer's regular sync writes it with the current live state.
      // Result: Mon plots baseline, Tue plots end-of-Mon, ..., today plots current state.
      if (s.startDate && s.endDate) {
        const days = enumerateWorkingDays(s.startDate, s.endDate);
        const todayKey = now.toISOString().slice(0, 10);
        for (let dIdx = 1; dIdx < days.length; dIdx++) {
          const day = days[dIdx];
          if (day >= todayKey) break;
          const prevDay = days[dIdx - 1];
          let value = 0;
          for (const key of committedKeys) {
            const issue = ticketByKey.get(key);
            const cl = ticketChangelogs.get(key);
            if (!issue || !cl) continue;
            const points = Number((issue.fields as Record<string, unknown>)[cfg.pointsField] ?? 0);
            const status = statusAtTime({
              currentStatus: mapJiraStatus(issue.fields.status.name).status,
              changelog: cl,
              at: endOfDayBrisbane(prevDay),
            });
            if (REMAINING_STATUSES.has(status)) value += points;
          }
          historicalCommittedRemaining.push({ sprintId: s.id, forDate: day, value });
        }
      }
    }

    // Detect sprints that have just transitioned out of active/future since the last sync —
    // i.e. Jira no longer returns them but our DB still has them flagged as active/future and
    // we haven't yet captured a close snapshot. Snapshot each one's roster at endDate before
    // the rest of the sync runs (the upsert below would otherwise reassign carried-over tickets'
    // sprintId, erasing membership history). Same pattern as the committed-freeze loop above:
    // one-shot per sprint, gated by closedSnapshotCapturedAt.
    const fetchedSprintIds = new Set(parsedSprints.map((s) => s.id));
    const newlyClosedSprints = existingSprintRows.filter(
      (s) =>
        !fetchedSprintIds.has(s.id) &&
        (s.state === "active" || s.state === "future") &&
        s.closedSnapshotCapturedAt == null,
    );

    const closeSnapshotWrites: Array<{
      sprintId: string;
      rows: ReturnType<typeof buildClosedSprintSnapshot>;
      finalBurndown: CloseBurndownSnapshot | null;
    }> = [];

    for (const s of newlyClosedSprints) {
      if (!s.endDate) {
        warnings.push(
          `Sprint ${s.id} (${s.name}) has no endDate — cannot snapshot close-time state`,
        );
        continue;
      }

      // Candidate keys = (tickets currently associated with this sprint in our DB) ∪
      // (frozen committedTicketKeys). Covers both tickets that stayed put and committed
      // tickets that may have been carried out before close.
      const liveKeyRows = await db
        .select({ key: schema.tickets.key })
        .from(schema.tickets)
        .where(eq(schema.tickets.sprintId, s.id));
      const candidateKeys = Array.from(
        new Set<string>([...liveKeyRows.map((r) => r.key), ...(s.committedTicketKeys ?? [])]),
      );

      const candidates: CloseSnapshotCandidate[] = [];
      for (const key of candidateKeys) {
        try {
          const [issue, cl] = await Promise.all([
            fetchIssueByKey(cfg, key),
            fetchIssueChangelog(cfg, key),
          ]);
          candidates.push({ issue, changelog: cl.values });
        } catch (err) {
          warnings.push(
            `Sprint ${s.id} close snapshot: failed to fetch ${key} — ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const rows = buildClosedSprintSnapshot({
        sprintId: s.id,
        sprintEndDate: s.endDate,
        pointsField: cfg.pointsField,
        candidates,
        committedKeys: new Set(s.committedTicketKeys ?? []),
        now,
      });
      const finalBurndown = buildClosedSprintBurndownSnapshot({
        sprintId: s.id,
        sprintEndDate: s.endDate,
        snapshot: rows,
        committedTicketKeys: s.committedTicketKeys ?? null,
        now,
      });
      closeSnapshotWrites.push({ sprintId: s.id, rows, finalBurndown });
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
        await tx
          .insert(schema.sprints)
          .values(write.sprintUpserts)
          .onConflictDoUpdate({
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
        await tx
          .insert(schema.teamMembers)
          .values(write.teamUpserts)
          .onConflictDoUpdate({
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
        await tx
          .insert(schema.tickets)
          .values(write.ticketUpserts)
          .onConflictDoUpdate({
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
        await tx
          .delete(schema.tickets)
          .where(
            and(
              notInArray(
                schema.tickets.key,
                write.activeTicketKeys.length > 0 ? write.activeTicketKeys : [""],
              ),
              inArray(schema.tickets.sprintId, write.activeSprintIds),
            ),
          );
      }

      // Epics + their assignees. Order matters here: team_members upsert runs above (FK target
      // for epic_assignees.assignee_id), then epics upsert (FK target for epic_assignees.epic_key),
      // then we replace the epic_assignees rows for synced epics, then delete epics that no longer
      // exist in Jira (cascade clears their epic_assignees rows).
      if (epicUpserts.length > 0) {
        await tx
          .insert(schema.epics)
          .values(epicUpserts)
          .onConflictDoUpdate({
            target: schema.epics.key,
            set: {
              title: sql`excluded.title`,
              status: sql`excluded.status`,
              ticketCount: sql`excluded.ticket_count`,
              lastSyncedAt: sql`excluded.last_synced_at`,
            },
          });
      }
      if (activeEpicKeys.length > 0) {
        await tx
          .delete(schema.epicAssignees)
          .where(inArray(schema.epicAssignees.epicKey, activeEpicKeys));
      }
      if (epicAssigneeRows.length > 0) {
        await tx.insert(schema.epicAssignees).values(epicAssigneeRows).onConflictDoNothing();
      }
      if (activeEpicKeys.length > 0) {
        await tx.delete(schema.epics).where(notInArray(schema.epics.key, activeEpicKeys));
      }
      if (write.burndownSnapshots.length > 0) {
        await tx
          .insert(schema.burndownSnapshots)
          .values(write.burndownSnapshots)
          .onConflictDoUpdate({
            target: [schema.burndownSnapshots.sprintId, schema.burndownSnapshots.forDate],
            set: {
              remainingPoints: sql`excluded.remaining_points`,
              totalPoints: sql`excluded.total_points`,
              committedRemainingPoints: sql`excluded.committed_remaining_points`,
              capturedAt: sql`excluded.captured_at`,
            },
          });
      }

      // Persist close-time snapshots for newly-closed sprints. Insert ignores conflicts so the
      // capture is idempotent if a retry races us. Also write a final burndown_snapshots row at
      // sprint endDate so the chart's actual line reaches the last working day (the daily cron
      // stops capturing snapshots once the sprint leaves active+future, so without this the
      // actual line trails off short of sprint end). After insert, mark the sprint as closed +
      // record the capture timestamp — gates re-entry into the close-detection branch above.
      for (const w of closeSnapshotWrites) {
        if (w.rows.length > 0) {
          await tx.insert(schema.closedSprintTickets).values(w.rows).onConflictDoNothing();
        }
        if (w.finalBurndown) {
          await tx
            .insert(schema.burndownSnapshots)
            .values(w.finalBurndown)
            .onConflictDoUpdate({
              target: [schema.burndownSnapshots.sprintId, schema.burndownSnapshots.forDate],
              set: {
                remainingPoints: sql`excluded.remaining_points`,
                totalPoints: sql`excluded.total_points`,
                committedRemainingPoints: sql`excluded.committed_remaining_points`,
                capturedAt: sql`excluded.captured_at`,
              },
            });
        }
        await tx
          .update(schema.sprints)
          .set({ state: "closed", closedSnapshotCapturedAt: now })
          .where(eq(schema.sprints.id, w.sprintId));
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
