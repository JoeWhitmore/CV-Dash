import { parseIssueIntoTicket } from "@/lib/jira/parsers";
import { statusAtTime, wasInSprintAt } from "@/lib/jira/sprint-history";
import type { JiraChangelogEntry, JiraIssue } from "@/lib/jira/types";
import { REMAINING_STATUSES } from "@/lib/sync/reducer";
import { rollBackToWorkingDay } from "@/lib/working-days";

export interface CloseSnapshotCandidate {
  issue: JiraIssue;
  changelog: JiraChangelogEntry[];
}

export interface CloseSnapshotInput {
  sprintId: string;
  /**
   * YYYY-MM-DD; the sprint's scheduled end date as reported by Jira. Jira commonly reports a
   * Sat/Sun endDate for a Mon-Fri working sprint (the sprint is "completed" by the team at end
   * of Friday but Jira's scheduled end is the weekend after). We roll back to the most recent
   * weekday before measuring state, so the snapshot reflects the team's true sprint-end position
   * — not whatever weekend cleanup pushed tickets further along.
   */
  sprintEndDate: string;
  pointsField: string;
  candidates: CloseSnapshotCandidate[];
  /**
   * Frozen committed-ticket keys for the sprint. Tickets in this set are unconditionally included
   * in the snapshot regardless of `wasInSprintAt` — the team committed to them at Monday 8AM,
   * so retro views must track their close-time status even if they were carried over to another
   * sprint mid-week. Non-committed candidates (spillover) are still gated on `wasInSprintAt`.
   * Defaults to empty (no committed keys) — every candidate is gated on `wasInSprintAt`.
   */
  committedKeys?: ReadonlySet<string>;
  now: Date;
}

export interface ClosedTicketSnapshot {
  sprintId: string;
  key: string;
  title: string;
  type: string;
  status: string;
  points: number;
  assigneeId: string | null;
  capturedAt: Date;
}

/** End-of-working-day Brisbane (UTC+10) as a UTC Date. Mirrors the helper in sync.ts. */
function endOfDayBrisbane(forDate: string): Date {
  return new Date(`${forDate}T14:00:00Z`);
}

/**
 * Given a set of candidate tickets (any that *might* have been in the sprint at close — typically
 * the union of "tickets currently in the sprint per Jira" and "tickets we previously froze as
 * committed"), returns the subset that was actually in the sprint at end-of-sprint, each tagged
 * with the status it held at that moment.
 *
 * Pure / synchronous so it's trivially unit-testable; the caller is responsible for fetching the
 * candidates + their changelogs from Jira and persisting the result.
 */
export function buildClosedSprintSnapshot(input: CloseSnapshotInput): ClosedTicketSnapshot[] {
  const cutoff = endOfDayBrisbane(rollBackToWorkingDay(input.sprintEndDate));
  const seen = new Set<string>();
  const out: ClosedTicketSnapshot[] = [];

  for (const { issue, changelog } of input.candidates) {
    if (seen.has(issue.key)) continue;
    seen.add(issue.key);

    // Committed tickets bypass the membership check — they're in the snapshot regardless,
    // because the team's commitment is the contract being retro'd against. Spillover candidates
    // (added to the sprint after Mon 8AM freeze) only count if they were actually in the sprint
    // at close.
    if (!input.committedKeys?.has(issue.key)) {
      const inSprint = wasInSprintAt({
        sprintId: input.sprintId,
        issueCreated: issue.fields.created,
        changelog,
        at: cutoff,
      });
      if (!inSprint) continue;
    }

    const parsed = parseIssueIntoTicket(issue, input.sprintId, { pointsField: input.pointsField });
    const status = statusAtTime({
      currentStatus: parsed.ticket.status,
      changelog,
      at: cutoff,
    });

    out.push({
      sprintId: input.sprintId,
      key: parsed.ticket.key,
      title: parsed.ticket.title,
      type: parsed.ticket.type,
      status,
      points: parsed.ticket.points,
      assigneeId: parsed.ticket.assigneeId,
      capturedAt: input.now,
    });
  }

  return out;
}

export interface CloseBurndownSnapshotInput {
  sprintId: string;
  /** YYYY-MM-DD; written to burndown_snapshots.for_date so the actual line reaches the final sprint day. */
  sprintEndDate: string;
  /** Output of buildClosedSprintSnapshot — the close-time roster with each ticket's status at endDate. */
  snapshot: ClosedTicketSnapshot[];
  /** Frozen committed-ticket keys for the sprint. Used to compute committedRemainingPoints. */
  committedTicketKeys: string[] | null;
  now: Date;
}

export interface CloseBurndownSnapshot {
  sprintId: string;
  forDate: string;
  capturedAt: Date;
  remainingPoints: number;
  totalPoints: number;
  committedRemainingPoints: number | null;
}

/**
 * Builds a final burndown_snapshots row for the sprint's last working day, derived from the
 * close-time roster. Without this, the dashboard's burndown chart's actual line has no data
 * point on the final day (the daily cron stops capturing snapshots once the sprint leaves
 * the active+future fetch), so it visually trails off short of the sprint end.
 *
 * `remainingPoints` / `committedRemainingPoints` are 0-anchored to whatever was still in a
 * REMAINING status at endDate — typically 0 for a closed sprint where everything reached
 * peer-review or beyond, non-zero if work was carried over still-in-progress.
 */
export function buildClosedSprintBurndownSnapshot(
  input: CloseBurndownSnapshotInput,
): CloseBurndownSnapshot {
  const totalPoints = input.snapshot.reduce((sum, t) => sum + t.points, 0);
  const remainingPoints = input.snapshot
    .filter((t) => REMAINING_STATUSES.has(t.status))
    .reduce((sum, t) => sum + t.points, 0);
  const committedSet = input.committedTicketKeys ? new Set(input.committedTicketKeys) : null;
  const committedRemainingPoints = committedSet
    ? input.snapshot
        .filter((t) => REMAINING_STATUSES.has(t.status) && committedSet.has(t.key))
        .reduce((sum, t) => sum + t.points, 0)
    : null;

  return {
    sprintId: input.sprintId,
    forDate: input.sprintEndDate,
    capturedAt: input.now,
    remainingPoints,
    totalPoints,
    committedRemainingPoints,
  };
}
