import { mapJiraStatus } from "@/lib/jira/status-map";
import type { JiraChangelogEntry } from "@/lib/jira/types";

export interface WasInSprintInput {
  sprintId: string;
  issueCreated: string;
  changelog: JiraChangelogEntry[];
  at: Date;
}

function parseSprintIds(value: string | null): Set<string> {
  if (!value) return new Set();
  return new Set(value.split(",").map((s) => s.trim()).filter(Boolean));
}

/**
 * Reconstructs whether an issue was in a given sprint at a target time, by walking
 * the Sprint-field history.
 *
 * Algorithm:
 *   1. Find the latest Sprint changelog entry with created <= at.
 *   2. If one exists: use its `to` (comma-separated sprint IDs) — true iff sprintId is in it.
 *   3. If none exists: fall back to "issue created before cutoff" — assume the ticket has been in
 *      the sprint since creation (setting Sprint at issue-creation does not always emit a change).
 *
 * Caller must pre-filter the issue to one that is currently or was ever in the sprint — this
 * function does not verify Jira-side membership; it reconstructs the membership transitions only.
 */
export function wasInSprintAt(input: WasInSprintInput): boolean {
  const { sprintId, issueCreated, changelog, at } = input;
  const cutoff = at.getTime();

  // Jira's Sprint changelog item exposes two parallel fields: `to` is a comma-separated
  // list of sprint IDs (e.g. "1649, 1650, 1683") and `toString` is the matching list of
  // sprint names (e.g. "Sprint 39, Sprint 40, Sprint 41"). The caller passes a sprintId
  // (numeric string), so we must compare against `to`, not `toString` — otherwise every
  // ticket that was moved between sprints via changelog gets dropped from the freeze.
  const sprintItems = changelog
    .filter((h) => new Date(h.created).getTime() <= cutoff)
    .flatMap((h) =>
      h.items
        .filter((i) => i.field === "Sprint")
        .map((i) => ({ created: new Date(h.created).getTime(), sprintValue: i.to })),
    )
    .sort((a, b) => a.created - b.created);

  if (sprintItems.length === 0) {
    return new Date(issueCreated).getTime() <= cutoff;
  }

  const last = sprintItems[sprintItems.length - 1];
  return parseSprintIds(last.sprintValue).has(sprintId);
}

export interface StatusAtTimeInput {
  /** The ticket's current mapped status (e.g. "to-do") — used as a fallback when the changelog has no status transitions at all. */
  currentStatus: string;
  changelog: JiraChangelogEntry[];
  at: Date;
}

/**
 * Reconstructs the mapped status of a ticket at a target time by walking the status-field history.
 *
 * Algorithm:
 *   1. Collect all status-field changelog items, sorted by created ASC.
 *   2. If at least one transition exists with created <= at: return the latest's `toString` (mapped).
 *   3. Else if any transitions exist (all after `at`): return the FIRST transition's `fromString` (mapped) —
 *      that's the initial status before any transitions happened.
 *   4. Else (no transitions ever): return `currentStatus` — the status has never changed.
 */
export function statusAtTime(input: StatusAtTimeInput): string {
  const { currentStatus, changelog, at } = input;
  const cutoff = at.getTime();

  const statusItems = changelog
    .flatMap((h) =>
      h.items
        .filter((i) => i.field === "status")
        .map((i) => ({
          created: new Date(h.created).getTime(),
          toString: i.toString,
          fromString: i.fromString,
        })),
    )
    .sort((a, b) => a.created - b.created);

  if (statusItems.length === 0) return currentStatus;

  const before = statusItems.filter((x) => x.created <= cutoff);
  if (before.length > 0) {
    return mapJiraStatus(before[before.length - 1].toString ?? "").status;
  }
  return mapJiraStatus(statusItems[0].fromString ?? "").status;
}
