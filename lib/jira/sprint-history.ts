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
 *   2. If one exists: use its `toString` (the post-change sprint set) — true iff sprintId is in it.
 *   3. If none exists: fall back to "issue created before cutoff" — assume the ticket has been in
 *      the sprint since creation (setting Sprint at issue-creation does not always emit a change).
 */
export function wasInSprintAt(input: WasInSprintInput): boolean {
  const { sprintId, issueCreated, changelog, at } = input;
  const cutoff = at.getTime();

  const sprintItems = changelog
    .filter((h) => new Date(h.created).getTime() <= cutoff)
    .flatMap((h) =>
      h.items
        .filter((i) => i.field === "Sprint")
        .map((i) => ({ created: new Date(h.created).getTime(), toString: i.toString })),
    )
    .sort((a, b) => a.created - b.created);

  if (sprintItems.length === 0) {
    return new Date(issueCreated).getTime() <= cutoff;
  }

  const last = sprintItems[sprintItems.length - 1];
  return parseSprintIds(last.toString).has(sprintId);
}
