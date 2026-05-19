"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { AssigneeFilter } from "@/components/dashboard/assignee-filter";
import { BurndownChart } from "@/components/dashboard/burndown-chart";
import {
  type EpicSummary,
  EpicsPanel,
  jiraStatusToStageId,
} from "@/components/dashboard/epics-panel";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { SprintSelector } from "@/components/dashboard/sprint-selector";
import { TicketColumns } from "@/components/dashboard/ticket-columns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sprintKpis } from "@/lib/kpi";
import type { BurndownPoint, Epic, Sprint, TeamMember, Ticket } from "@/lib/types";

interface Props {
  sprints: Sprint[];
  currentSprint: Sprint;
  tickets: Ticket[];
  team: TeamMember[];
  epics: Epic[];
  burndown: BurndownPoint[];
  lastSyncedAt: string | null;
  todayIso: string;
}

export function DashboardClient({
  sprints,
  currentSprint,
  tickets,
  team,
  epics,
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

  // Mirror the KPI tile / burndown precedent: when the sprint has a frozen start-of-sprint
  // snapshot, restrict the ticket columns to that set so spillover added mid-sprint is
  // excluded. Fall back to all sprint tickets if the freeze hasn't happened yet.
  const scopedTickets = useMemo(() => {
    if (!currentSprint.committedTicketKeys) return tickets;
    const committed = new Set(currentSprint.committedTicketKeys);
    return tickets.filter((t) => committed.has(t.key));
  }, [tickets, currentSprint.committedTicketKeys]);

  const visibleTickets = useMemo(
    () =>
      assigneeIds.length === 0
        ? scopedTickets
        : scopedTickets.filter((t) => assigneeIds.includes(t.assigneeId)),
    [scopedTickets, assigneeIds],
  );

  // Convert DB epics (assigneeIds: string[]) into the panel's EpicSummary shape by joining with
  // team. Epics whose raw Jira status doesn't map to one of our 8 stages are filtered out — they
  // belong to a workflow status we haven't surfaced yet (e.g. a deprecated "Backlog" status).
  const epicSummaries = useMemo<EpicSummary[]>(() => {
    const teamById = new Map(team.map((m) => [m.id, m]));
    const out: EpicSummary[] = [];
    for (const e of epics) {
      const stage = jiraStatusToStageId(e.status);
      if (!stage) continue;
      out.push({
        key: e.key,
        title: e.title,
        stage,
        ticketCount: e.ticketCount,
        assignees: e.assigneeIds
          .map((id) => teamById.get(id))
          .filter((m): m is TeamMember => m !== undefined)
          .map((m) => ({ id: m.id, name: m.name, initials: m.initials })),
      });
    }
    return out;
  }, [epics, team]);

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
          <span className="text-xs text-muted-foreground" suppressHydrationWarning>
            {lastSyncLabel}
          </span>
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

      <Tabs defaultValue="priorities" className="gap-4">
        <TabsList variant="line" className="w-fit">
          <TabsTrigger value="priorities">Priorities</TabsTrigger>
          <TabsTrigger value="epics">Epics</TabsTrigger>
        </TabsList>

        <TabsContent value="priorities" className="flex flex-col gap-4">
          <AssigneeFilter
            team={team}
            value={assigneeIds}
            onChange={(ids) => update({ assigneeIds: ids })}
          />
          <TicketColumns tickets={visibleTickets} team={team} />
        </TabsContent>

        <TabsContent value="epics">
          <EpicsPanel epics={epicSummaries} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
