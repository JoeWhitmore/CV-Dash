import { IN_SCOPE_STATUSES } from "@/lib/status";
import type { Status, Ticket } from "@/lib/types";

const IN_SCOPE = new Set<string>(IN_SCOPE_STATUSES);

// "Complete" = the ticket has crossed the peer-review threshold. Once a ticket reaches PR
// it stays counted toward "Points to PR" even if it later moves to Testing, Done, or Closed.
const COMPLETE: Set<Status> = new Set(["peer-review", "testing", "done", "closed"]);

export function isInScope(ticket: Ticket): boolean {
  return IN_SCOPE.has(ticket.status);
}

export function isComplete(ticket: Ticket): boolean {
  return COMPLETE.has(ticket.status);
}

export function filterInScope(tickets: Ticket[]): Ticket[] {
  return tickets.filter(isInScope);
}
