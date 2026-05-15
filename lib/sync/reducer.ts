import type { ParsedSprint, ParsedTicket } from "@/lib/jira/parsers";
import type { DerivedTeamMember } from "@/lib/sync/team-derivation";

const REMAINING_STATUSES = new Set(["to-do", "in-progress", "in-review"]);

export interface SprintUpsert {
  id: string;
  name: string;
  state: "active" | "future" | "closed";
  startDate: string | null;
  endDate: string | null;
  baselinePoints: number;
  baselineCapturedAt: Date;
  jiraBoardId: string;
}

export interface TicketUpsert {
  key: string;
  title: string;
  type: string;
  status: string;
  points: number;
  assigneeId: string | null;
  sprintId: string;
  jiraUpdatedAt: Date;
  lastSyncedAt: Date;
}

export interface BurndownSnapshotInsert {
  sprintId: string;
  capturedAt: Date;
  remainingPoints: number;
  totalPoints: number;
}

export interface SyncWriteInput {
  sprints: ParsedSprint[];
  tickets: ParsedTicket[];
  assignees: DerivedTeamMember[];
  existingBaselines: Map<string, { baselinePoints: number; baselineCapturedAt: Date }>;
  now: Date;
}

export interface SyncWriteOutput {
  sprintUpserts: SprintUpsert[];
  ticketUpserts: TicketUpsert[];
  teamUpserts: DerivedTeamMember[];
  burndownSnapshots: BurndownSnapshotInsert[];
  activeTicketKeys: string[];
  activeSprintIds: string[];
}

export function buildSyncWrite(input: SyncWriteInput): SyncWriteOutput {
  const { sprints, tickets, assignees, existingBaselines, now } = input;

  const ticketsBySprint = new Map<string, ParsedTicket[]>();
  for (const t of tickets) {
    const list = ticketsBySprint.get(t.sprintId) ?? [];
    list.push(t);
    ticketsBySprint.set(t.sprintId, list);
  }

  const sprintUpserts: SprintUpsert[] = sprints.map((s) => {
    const existing = existingBaselines.get(s.id);
    const sprintTickets = ticketsBySprint.get(s.id) ?? [];
    const baselinePoints = existing?.baselinePoints ?? sprintTickets.reduce((sum, t) => sum + t.points, 0);
    const baselineCapturedAt = existing?.baselineCapturedAt ?? now;
    return {
      id: s.id,
      name: s.name,
      state: s.state,
      startDate: s.startDate,
      endDate: s.endDate,
      baselinePoints,
      baselineCapturedAt,
      jiraBoardId: s.jiraBoardId,
    };
  });

  const ticketUpserts: TicketUpsert[] = tickets.map((t) => ({
    key: t.key,
    title: t.title,
    type: t.type,
    status: t.status,
    points: t.points,
    assigneeId: t.assigneeId,
    sprintId: t.sprintId,
    jiraUpdatedAt: t.jiraUpdatedAt,
    lastSyncedAt: now,
  }));

  const burndownSnapshots: BurndownSnapshotInsert[] = sprints.map((s) => {
    const sprintTickets = ticketsBySprint.get(s.id) ?? [];
    const remainingPoints = sprintTickets
      .filter((t) => REMAINING_STATUSES.has(t.status))
      .reduce((sum, t) => sum + t.points, 0);
    const totalPoints = sprintTickets.reduce((sum, t) => sum + t.points, 0);
    return { sprintId: s.id, capturedAt: now, remainingPoints, totalPoints };
  });

  return {
    sprintUpserts,
    ticketUpserts,
    teamUpserts: assignees,
    burndownSnapshots,
    activeTicketKeys: tickets.map((t) => t.key),
    activeSprintIds: sprints.map((s) => s.id),
  };
}
