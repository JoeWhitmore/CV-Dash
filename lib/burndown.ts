import type { BurndownPoint } from "@/lib/types";
import { enumerateWorkingDays, rollBackToWorkingDay } from "@/lib/working-days";

export interface ProjectBurndownInput {
  sprint: {
    startDate: string | null;
    endDate: string | null;
    baselinePoints: number | null;
    /**
     * When set, the ideal line uses this as its starting value and the actual line uses
     * each snapshot's `committedRemainingPoints`. Both metrics are then locked to the
     * committed-ticket scope (= the set frozen at Monday 8AM Brisbane). When null, the
     * function falls back to the unrestricted baseline + remainingPoints.
     */
    committedBaselinePoints: number | null;
  };
  /**
   * One snapshot per (sprint, working day). `forDate` is the ISO date the snapshot
   * represents — i.e. the working day for which `remainingPoints` is the end-of-day total.
   * `committedRemainingPoints` is the remaining-points figure restricted to the committed
   * ticket set; null for snapshots captured before the sprint's freeze was established.
   */
  snapshots: Array<{
    forDate: string;
    remainingPoints: number;
    committedRemainingPoints: number | null;
  }>;
}

/**
 * Project per-working-day burndown snapshots into chart-ready points across the sprint's
 * working days (Mon-Fri only). The ideal line drops linearly from baseline to 0 across the
 * working-day count. Real `remaining` values come from snapshots; weekday slots with no
 * snapshot (future days) get `remaining: null` so the chart doesn't connect through them.
 */
export function projectBurndown(input: ProjectBurndownInput): BurndownPoint[] {
  const { sprint, snapshots } = input;
  if (!sprint.startDate || !sprint.endDate) return [];

  const workingDays = enumerateWorkingDays(sprint.startDate, sprint.endDate);
  if (workingDays.length === 0) return [];

  // Use the committed scope when present (= frozen at Monday 8AM Brisbane). The actual line
  // pulls each snapshot's committedRemainingPoints; the ideal line drops from
  // committedBaselinePoints to 0 across working days.
  const useCommitted = sprint.committedBaselinePoints != null;
  const baseline = useCommitted ? sprint.committedBaselinePoints! : (sprint.baselinePoints ?? 0);
  const lastIndex = workingDays.length - 1;

  const idealAtIndex = (i: number) =>
    lastIndex === 0 ? baseline : Math.round(baseline * (1 - i / lastIndex));

  const byDate = new Map<string, BurndownPoint>();
  workingDays.forEach((date, i) => {
    byDate.set(date, { date, remaining: null, ideal: idealAtIndex(i) });
  });

  // Overlay snapshots onto matching working days. A snapshot whose forDate is a Saturday
  // or Sunday (e.g. manual refresh on a weekend) rolls back to the preceding Friday.
  const workingDaySet = new Set(workingDays);
  for (const s of snapshots) {
    const target = rollBackToWorkingDay(s.forDate);
    if (!workingDaySet.has(target)) continue;
    const existing = byDate.get(target);
    if (!existing) continue;
    // Prefer the committed value when the sprint is in committed mode; if a particular
    // snapshot predates the freeze (committedRemainingPoints null) skip it rather than
    // mixing scopes on one chart.
    const remaining = useCommitted ? s.committedRemainingPoints : s.remainingPoints;
    if (remaining == null) continue;
    byDate.set(target, { ...existing, remaining });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
