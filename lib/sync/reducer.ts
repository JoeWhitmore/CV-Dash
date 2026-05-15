import type { ParsedSprint, ParsedTicket } from "@/lib/jira/parsers";
import type { DerivedTeamMember } from "@/lib/sync/team-derivation";

export const REMAINING_STATUSES = new Set(["to-do", "blocked", "in-progress"]);

export interface SprintUpsert {
  id: string;
  name: string;
  state: "active" | "future" | "closed";
  startDate: string | null;
  endDate: string | null;
  baselinePoints: number;
  baselineCapturedAt: Date;
  committedTicketKeys: string[] | null;
  committedCapturedAt: Date | null;
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
  forDate: string;
  capturedAt: Date;
  remainingPoints: number;
  totalPoints: number;
  committedRemainingPoints: number | null;
}

export interface SyncWriteInput {
  sprints: ParsedSprint[];
  tickets: ParsedTicket[];
  assignees: DerivedTeamMember[];
  existingBaselines: Map<string, { baselinePoints: number; baselineCapturedAt: Date }>;
  existingCommitments: Map<string, { ticketKeys: string[]; capturedAt: Date }>;
  commitmentFreezes: Map<string, string[]>;
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
  const { sprints, tickets, assignees, existingBaselines, existingCommitments, commitmentFreezes, now } = input;

  const ticketsBySprint = new Map<string, ParsedTicket[]>();
  for (const t of tickets) {
    const list = ticketsBySprint.get(t.sprintId) ?? [];
    list.push(t);
    ticketsBySprint.set(t.sprintId, list);
  }

  const sprintUpserts: SprintUpsert[] = sprints.map((s) => {
    const existingBaseline = existingBaselines.get(s.id);
    const existingCommitment = existingCommitments.get(s.id);
    const freezeKeys = commitmentFreezes.get(s.id);

    const sprintTickets = ticketsBySprint.get(s.id) ?? [];
    const baselinePoints = existingBaseline?.baselinePoints ?? sprintTickets.reduce((sum, t) => sum + t.points, 0);
    const baselineCapturedAt = existingBaseline?.baselineCapturedAt ?? now;

    let committedTicketKeys: string[] | null = existingCommitment?.ticketKeys ?? null;
    let committedCapturedAt: Date | null = existingCommitment?.capturedAt ?? null;
    if (!existingCommitment && freezeKeys) {
      committedTicketKeys = freezeKeys;
      committedCapturedAt = now;
    }

    return {
      id: s.id,
      name: s.name,
      state: s.state,
      startDate: s.startDate,
      endDate: s.endDate,
      baselinePoints,
      baselineCapturedAt,
      committedTicketKeys,
      committedCapturedAt,
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

    // If this sprint has (or is gaining) a frozen committed-ticket set, compute remaining
    // restricted to those tickets. Otherwise leave null and consumers fall back to the
    // unrestricted figure above.
    const committedKeys =
      existingCommitments.get(s.id)?.ticketKeys ?? commitmentFreezes.get(s.id) ?? null;
    const committedRemainingPoints = committedKeys
      ? sprintTickets
          .filter((t) => REMAINING_STATUSES.has(t.status) && committedKeys.includes(t.key))
          .reduce((sum, t) => sum + t.points, 0)
      : null;

    return {
      sprintId: s.id,
      forDate: now.toISOString().slice(0, 10),
      capturedAt: now,
      remainingPoints,
      totalPoints,
      committedRemainingPoints,
    };
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
