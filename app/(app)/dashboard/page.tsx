"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { AssigneeFilter } from "@/components/dashboard/assignee-filter";
import { BurndownChart } from "@/components/dashboard/burndown-chart";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { SprintSelector } from "@/components/dashboard/sprint-selector";
import { TicketColumns } from "@/components/dashboard/ticket-columns";
import { sprintKpis } from "@/lib/kpi";
import { burndownBySprint, currentSprintId, sprintById, sprints, team, tickets } from "@/lib/mock";

const TODAY = "2026-05-14";

function DashboardInner() {
  const router = useRouter();
  const params = useSearchParams();

  const sprintId = params.get("sprint") ?? currentSprintId;
  const sprint = sprintById[sprintId] ?? sprintById[currentSprintId];
  const assigneeIds = (params.get("assignees") ?? "").split(",").filter(Boolean);

  const sprintTickets = useMemo(
    () => tickets.filter((t) => sprint.ticketKeys.includes(t.key)),
    [sprint],
  );

  const kpis = useMemo(() => sprintKpis(sprint, tickets, TODAY), [sprint]);
  const burndown = burndownBySprint[sprint.id] ?? [];

  const visibleTickets = useMemo(
    () =>
      assigneeIds.length === 0
        ? sprintTickets
        : sprintTickets.filter((t) => assigneeIds.includes(t.assigneeId)),
    [sprintTickets, assigneeIds],
  );

  function update(next: { sprintId?: string; assigneeIds?: string[] }) {
    const sp = new URLSearchParams(params.toString());
    if (next.sprintId !== undefined) sp.set("sprint", next.sprintId);
    if (next.assigneeIds !== undefined) {
      if (next.assigneeIds.length === 0) sp.delete("assignees");
      else sp.set("assignees", next.assigneeIds.join(","));
    }
    router.replace(`/dashboard?${sp.toString()}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{sprint.name}</h1>
        <SprintSelector
          sprints={sprints}
          value={sprint.id}
          onChange={(id) => update({ sprintId: id })}
        />
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

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <DashboardInner />
    </Suspense>
  );
}
