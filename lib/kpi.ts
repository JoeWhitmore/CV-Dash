import { filterInScope, isComplete } from "@/lib/scope";
import type { Sprint, Ticket } from "@/lib/types";
import { workingDaysBetween } from "@/lib/working-days";

export interface SprintKpis {
  pointsCommitted: number;
  pointsToPr: number;
  percentComplete: number; // 0..100, one decimal place precision
  daysRemaining: number;
}

export function sprintKpis(sprint: Sprint, tickets: Ticket[], todayISO: string): SprintKpis {
  const inSprint = tickets.filter((t) => sprint.ticketKeys.includes(t.key));
  const inScope = filterInScope(inSprint);

  const committedSet = sprint.committedTicketKeys
    ? new Set(sprint.committedTicketKeys)
    : null;
  // Freeze path (committedTicketKeys set): sum all committed tickets regardless of status so
  // pointsCommitted stays constant as tickets move through the board. This is intentional —
  // the commitment is captured once at Monday 8AM Brisbane and must not drift.
  // Fallback path (null): sum in-scope tickets only (pre-existing behavior, used before cutoff).
  const pointsCommitted = committedSet
    ? inSprint.filter((t) => committedSet.has(t.key)).reduce((s, t) => s + t.points, 0)
    : inScope.reduce((s, t) => s + t.points, 0);

  const pointsToPr = inScope.filter(isComplete).reduce((s, t) => s + t.points, 0);
  const percentComplete =
    pointsCommitted === 0 ? 0 : Math.round((pointsToPr / pointsCommitted) * 1000) / 10;

  const daysRemaining = workingDaysBetween(todayISO, sprint.endDate);

  return { pointsCommitted, pointsToPr, percentComplete, daysRemaining };
}
