export type Status =
  | "to-do"
  | "blocked"
  | "in-progress"
  | "peer-review"
  | "testing"
  | "done"
  | "closed";

export type TicketType = "story" | "bug" | "task";

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  avatarUrl?: string;
}

export interface Ticket {
  key: string;
  title: string;
  type: TicketType;
  status: Status;
  points: number;
  assigneeId: string;
}

export interface Sprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  ticketKeys: string[];
  committedTicketKeys: string[] | null;
}

export interface BurndownPoint {
  date: string;
  remaining: number | null;
  ideal: number;
}

export interface Epic {
  key: string;
  title: string;
  status: string; // raw Jira status string ("Discovery", "In QA", ...). Mapped to a display label client-side.
  ticketCount: number;
  assigneeIds: string[]; // unique team_members.id of assignees on non-Done child tickets
}
