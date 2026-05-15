import type { JiraChangelogEntry } from "@/lib/jira/types";

export interface StatusAtTimeInput {
  changelog: JiraChangelogEntry[];
  /** Status as of "now" — typically the value on the current issue fetch. */
  currentStatus: string;
  at: Date;
}

/**
 * Determine what status an issue had at a given point in time, by walking the changelog.
 *
 * Algorithm: the earliest status change with `created > at` carries the status that was
 * in force at `at` in its `fromString` field. If no such change exists, the issue's
 * current status was already in force at the target time.
 */
export function statusAtTime(input: StatusAtTimeInput): string {
  const { changelog, currentStatus, at } = input;
  const cutoff = at.getTime();

  const futureStatusChanges = changelog
    .filter((h) => new Date(h.created).getTime() > cutoff)
    .flatMap((h) =>
      h.items
        .filter((i) => i.field === "status")
        .map((i) => ({ created: new Date(h.created).getTime(), fromString: i.fromString })),
    )
    .sort((a, b) => a.created - b.created);

  if (futureStatusChanges.length === 0) return currentStatus;
  return futureStatusChanges[0].fromString ?? currentStatus;
}
