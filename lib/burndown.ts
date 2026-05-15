import type { BurndownPoint } from "@/lib/types";
import { enumerateWorkingDays, rollBackToWorkingDay } from "@/lib/working-days";

export interface ProjectBurndownInput {
  sprint: {
    startDate: string | null;
    endDate: string | null;
    baselinePoints: number | null;
  };
  snapshots: Array<{ capturedAt: Date; remainingPoints: number }>;
}

/**
 * Project DB burndown snapshots into chart-ready points across the sprint's working days
 * (Mon-Fri only). The ideal line drops linearly from baseline to 0 across the working-day
 * count. Snapshots captured on weekends roll back to the previous Friday.
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
    byDate.set(date, {
      date,
      remaining: i === 0 ? baseline : null,
      ideal: idealAtIndex(i),
    });
  });

  const workingDaySet = new Set(workingDays);
  for (const s of snapshots) {
    const captured = s.capturedAt.toISOString().slice(0, 10);
    const target = rollBackToWorkingDay(captured);
    if (!workingDaySet.has(target)) continue;
    const existing = byDate.get(target);
    if (!existing) continue;
    byDate.set(target, { ...existing, remaining: s.remainingPoints });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
