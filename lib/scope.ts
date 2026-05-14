import { IN_SCOPE_STATUSES } from "@/lib/status";
import type { Ticket } from "@/lib/types";

const IN_SCOPE = new Set<string>(IN_SCOPE_STATUSES);

export function isInScope(ticket: Ticket): boolean {
  return IN_SCOPE.has(ticket.status);
}

export function isComplete(ticket: Ticket): boolean {
  return ticket.status === "peer-review";
}

export function filterInScope(tickets: Ticket[]): Ticket[] {
  return tickets.filter(isInScope);
}
