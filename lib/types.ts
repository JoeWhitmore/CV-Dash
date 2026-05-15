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
