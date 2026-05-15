import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  getBurndown,
  getCurrentSprintId,
  getLastSyncedAt,
  getSprints,
  getTeam,
  getTickets,
} from "@/lib/db/queries";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sprint?: string }>;
}) {
  const sp = await searchParams;
  const sprints = await getSprints();
  if (sprints.length === 0) return <EmptyState />;

  const currentId = sp.sprint ?? (await getCurrentSprintId()) ?? sprints[0].id;
  const sprint = sprints.find((s) => s.id === currentId) ?? sprints[0];

  const [tickets, team, burndown, lastSyncedAt] = await Promise.all([
    getTickets(sprint.id),
    getTeam(),
    getBurndown(sprint.id),
    getLastSyncedAt(),
  ]);

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <Suspense fallback={<div>Loading…</div>}>
      <DashboardClient
        sprints={sprints}
        currentSprint={sprint}
        tickets={tickets}
        team={team}
        burndown={burndown}
        lastSyncedAt={lastSyncedAt ? lastSyncedAt.toISOString() : null}
        todayIso={todayIso}
      />
    </Suspense>
  );
}
