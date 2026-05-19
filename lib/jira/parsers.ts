import { mapJiraStatus } from "@/lib/jira/status-map";
import type { JiraIssue, JiraSprint, JiraSprintListResponse } from "@/lib/jira/types";
import { initialsFromName, slugFromName } from "@/lib/sync/slug";
import type { TicketType } from "@/lib/types";

export interface ParsedSprint {
  id: string;
  name: string;
  state: "active" | "future" | "closed";
  startDate: string | null; // date-only YYYY-MM-DD for burndown working-day calcs
  startedAt: Date | null; // full timestamp of when Jira's "Start Sprint" was actioned
  endDate: string | null;
  jiraBoardId: string;
}

export interface ParsedTicket {
  key: string;
  title: string;
  type: TicketType;
  status: string;
  points: number;
  assigneeId: string | null;
  sprintId: string;
  jiraUpdatedAt: Date;
}

export interface ParsedAssignee {
  id: string;
  jiraAccountId: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
}

export interface ParseIssueResult {
  ticket: ParsedTicket;
  assignee: ParsedAssignee | null;
  warnings: string[];
}

export interface ParseIssueOptions {
  pointsField: string;
}

function toIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function mapType(name: string): { type: TicketType; warning?: string } {
  const key = name.trim().toLowerCase();
  if (key === "story") return { type: "story" };
  if (key === "bug") return { type: "bug" };
  if (key === "task" || key === "sub-task" || key === "subtask") return { type: "task" };
  return {
    type: "task",
    warning: `Unknown Jira issue type: '${name}' — mapped to 'task'`,
  };
}

export interface ParsedEpic {
  key: string;
  title: string;
  status: string; // raw Jira status name
}

export function parseEpic(issue: JiraIssue): ParsedEpic {
  return {
    key: issue.key,
    title: issue.fields.summary,
    status: issue.fields.status.name,
  };
}

export interface ParsedEpicChild {
  epicKey: string | null;
  childKey: string;
  childStatus: string; // raw Jira status
  assignee: ParsedAssignee | null;
}

export function parseEpicChild(issue: JiraIssue): ParsedEpicChild {
  // The parent field is present on every issue with a parent (epic link). Shape:
  // { key: "CV-5423", fields: { status: { name: "Building" }, ... } }
  const parent = (issue.fields as { parent?: { key?: string } }).parent;
  const epicKey = parent?.key ?? null;

  const assignee = issue.fields.assignee;
  const parsedAssignee: ParsedAssignee | null = assignee
    ? {
        id: slugFromName(assignee.displayName),
        jiraAccountId: assignee.accountId,
        name: assignee.displayName,
        initials: initialsFromName(assignee.displayName),
        avatarUrl: assignee.avatarUrls?.["48x48"] ?? null,
      }
    : null;

  return {
    epicKey,
    childKey: issue.key,
    childStatus: issue.fields.status.name,
    assignee: parsedAssignee,
  };
}

export function parseSprintList(payload: JiraSprintListResponse): ParsedSprint[] {
  return payload.values.map((s: JiraSprint) => ({
    id: String(s.id),
    name: s.name,
    state: s.state,
    startDate: toIsoDate(s.startDate),
    startedAt: s.startDate ? new Date(s.startDate) : null,
    endDate: toIsoDate(s.endDate),
    jiraBoardId: String(s.originBoardId),
  }));
}

/**
 * Caller passes the sprintId of the iteration context (Jira issues can belong to multiple sprints,
 * and the order in customfield_10020 is not reliably "active last"). The HTTP layer fetches issues
 * per-sprint via `/rest/agile/1.0/sprint/{sprintId}/issue`, so the caller always knows the context.
 */
export function parseIssueIntoTicket(
  issue: JiraIssue,
  sprintId: string,
  opts: ParseIssueOptions,
): ParseIssueResult {
  const warnings: string[] = [];
  const statusMap = mapJiraStatus(issue.fields.status.name);
  if (statusMap.warning) warnings.push(statusMap.warning);
  const typeMap = mapType(issue.fields.issuetype.name);
  if (typeMap.warning) warnings.push(typeMap.warning);

  const rawPoints = (issue.fields as any)[opts.pointsField];
  const points =
    typeof rawPoints === "number" && Number.isFinite(rawPoints) ? Math.round(rawPoints) : 0;

  const assignee = issue.fields.assignee;
  const parsedAssignee: ParsedAssignee | null = assignee
    ? {
        id: slugFromName(assignee.displayName),
        jiraAccountId: assignee.accountId,
        name: assignee.displayName,
        initials: initialsFromName(assignee.displayName),
        avatarUrl: assignee.avatarUrls?.["48x48"] ?? null,
      }
    : null;

  const ticket: ParsedTicket = {
    key: issue.key,
    title: issue.fields.summary,
    type: typeMap.type,
    status: statusMap.status,
    points,
    assigneeId: parsedAssignee?.id ?? null,
    sprintId,
    jiraUpdatedAt: new Date(issue.fields.updated),
  };

  return { ticket, assignee: parsedAssignee, warnings };
}
