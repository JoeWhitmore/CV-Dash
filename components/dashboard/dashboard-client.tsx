"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { AssigneeFilter } from "@/components/dashboard/assignee-filter";
import { BurndownChart } from "@/components/dashboard/burndown-chart";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { SprintSelector } from "@/components/dashboard/sprint-selector";
import { TicketColumns } from "@/components/dashboard/ticket-columns";
import { sprintKpis } from "@/lib/kpi";
import type { BurndownPoint, Sprint, TeamMember, Ticket } from "@/lib/types";

interface Props {
  sprints: Sprint[];
  currentSprint: Sprint;
  tickets: Ticket[];
  team: TeamMember[];
  burndown: BurndownPoint[];
  lastSyncedAt: string | null;
  todayIso: string;
}

export function DashboardClient({
  sprints,
  currentSprint,
  tickets,
  team,
  burndown,
  lastSyncedAt,
  todayIso,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const assigneeIds = (params.get("assignees") ?? "").split(",").filter(Boolean);
  const kpis = useMemo(
    () => sprintKpis(currentSprint, tickets, todayIso),
    [currentSprint, tickets, todayIso],
  );

  const visibleTickets = useMemo(
    () =>
      assigneeIds.length === 0
        ? tickets
        : tickets.filter((t) => assigneeIds.includes(t.assigneeId)),
    [tickets, assigneeIds],
  );

  function update(next: { sprintId?: string; assigneeIds?: string[] }) {
    const sp = new URLSearchParams(params.toString());
    if (next.sprintId !== undefined) sp.set("sprint", next.sprintId);
    if (next.assigneeIds !== undefined) {
      if (next.assigneeIds.length === 0) sp.delete("assignees");
      else sp.set("assignees", next.assigneeIds.join(","));
    }
    router.replace(`/dashboard?${sp.toString()}`, { scroll: false });
  }

  const lastSyncLabel = lastSyncedAt
    ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}`
    : "Never synced";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{currentSprint.name}</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{lastSyncLabel}</span>
          <SprintSelector
            sprints={sprints}
            value={currentSprint.id}
            onChange={(id) => update({ sprintId: id })}
          />
          <RefreshButton />
        </div>
      </div>

      <KpiRow kpis={kpis} />
      <BurndownChart data={burndown} />
      <AssigneeFilter
        team={team}
        value={assigneeIds}
        onChange={(ids) => update({ assigneeIds: ids })}
      />
      <TicketColumns tickets={visibleTickets} team={team} />
    </div>
  );
}
