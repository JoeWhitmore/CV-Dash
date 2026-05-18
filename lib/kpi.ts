import { isComplete } from "@/lib/scope";
import type { Sprint, Ticket } from "@/lib/types";
import { workingDaysBetween } from "@/lib/working-days";

export interface SprintKpis {
  pointsCommitted: number;
  pointsToPr: number;
  percentComplete: number; // 0..100, one decimal place precision
  daysRemaining: number;
}

/**
 * Both pointsCommitted and pointsToPr operate on the SAME scope so the ratio is meaningful:
 *
 * - **Freeze path** (`committedTicketKeys` set on sprint): the scope is the frozen set
 *   captured at the sprint's Jira startDate (00:00 Brisbane), restricted to tickets that
 *   were in to-do / in-progress / blocked at that moment. Carryover tickets that came in
 *   already in peer-review / testing / etc are excluded; spillover added later doesn't count.
 * - **Fallback path** (no freeze yet): the scope is every ticket currently in the sprint.
 *   This is used for sprints that haven't reached their cutoff or haven't been synced since.
 *
 * Within that scope, `pointsCommitted` is the sum of all ticket points (regardless of current
 * status) and `pointsToPr` is the sum of points for tickets that have reached peer-review
 * (status in {peer-review, testing, done, closed}).
 */
export function sprintKpis(sprint: Sprint, tickets: Ticket[], todayISO: string): SprintKpis {
  const committedSet = sprint.committedTicketKeys
    ? new Set(sprint.committedTicketKeys)
    : null;

  const scope = committedSet
    ? tickets.filter((t) => committedSet.has(t.key))
    : tickets.filter((t) => sprint.ticketKeys.includes(t.key));

  const pointsCommitted = scope.reduce((s, t) => s + t.points, 0);
  const pointsToPr = scope.filter(isComplete).reduce((s, t) => s + t.points, 0);
  const percentComplete =
    pointsCommitted === 0 ? 0 : Math.round((pointsToPr / pointsCommitted) * 1000) / 10;

  const daysRemaining = workingDaysBetween(todayISO, sprint.endDate);

  return { pointsCommitted, pointsToPr, percentComplete, daysRemaining };
}
