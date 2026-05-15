import type { BurndownPoint } from "@/lib/types";
import { enumerateWorkingDays, rollBackToWorkingDay } from "@/lib/working-days";

export interface ProjectBurndownInput {
  sprint: {
    startDate: string | null;
    endDate: string | null;
    baselinePoints: number | null;
  };
  /**
   * One snapshot per (sprint, working day). `forDate` is the ISO date the snapshot
   * represents — i.e. the working day for which `remainingPoints` is the end-of-day total.
   */
  snapshots: Array<{ forDate: string; remainingPoints: number }>;
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

  const baseline = sprint.baselinePoints ?? 0;
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
    byDate.set(target, { ...existing, remaining: s.remainingPoints });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
