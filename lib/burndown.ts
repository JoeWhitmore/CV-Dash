import type { BurndownPoint } from "@/lib/types";

export interface ProjectBurndownInput {
  sprint: {
    startDate: string | null;
    endDate: string | null;
    baselinePoints: number | null;
  };
  snapshots: Array<{ capturedAt: Date; remainingPoints: number }>;
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

export function projectBurndown(input: ProjectBurndownInput): BurndownPoint[] {
  const { sprint, snapshots } = input;
  if (!sprint.startDate || !sprint.endDate) return [];

  const baseline = sprint.baselinePoints ?? 0;
  const totalSpan = daysBetween(sprint.startDate, sprint.endDate);
  const startMs = new Date(`${sprint.startDate}T00:00:00Z`).getTime();

  const idealAt = (ms: number) => {
    const elapsed = Math.min(totalSpan, Math.max(0, Math.floor((ms - startMs) / 86_400_000)));
    return Math.round(baseline * (1 - elapsed / totalSpan));
  };

  const byDate = new Map<string, BurndownPoint>();
  // Start anchor: at sprint start, all baseline points are "remaining" — gives the actual line a left edge.
  byDate.set(sprint.startDate, { date: sprint.startDate, remaining: baseline, ideal: baseline });
  // End anchor: ideal ends at 0; actual remains null so the line doesn't extrapolate into the future.
  byDate.set(sprint.endDate, { date: sprint.endDate, remaining: null, ideal: 0 });

  for (const s of snapshots) {
    const date = s.capturedAt.toISOString().slice(0, 10);
    byDate.set(date, {
      date,
      remaining: s.remainingPoints,
      ideal: idealAt(s.capturedAt.getTime()),
    });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
