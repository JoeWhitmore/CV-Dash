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
  if (!sprint.startDate || !sprint.endDate || snapshots.length === 0) return [];

  const baseline = sprint.baselinePoints ?? 0;
  const totalSpan = daysBetween(sprint.startDate, sprint.endDate);
  const startMs = new Date(`${sprint.startDate}T00:00:00Z`).getTime();

  return snapshots.map((s) => {
    const date = s.capturedAt.toISOString().slice(0, 10);
    const elapsedDays = Math.min(
      totalSpan,
      Math.max(0, Math.floor((s.capturedAt.getTime() - startMs) / 86_400_000)),
    );
    const ideal = Math.round(baseline * (1 - elapsedDays / totalSpan));
    return { date, remaining: s.remainingPoints, ideal };
  });
}
