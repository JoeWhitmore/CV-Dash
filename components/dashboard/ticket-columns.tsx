import { Badge } from "@/components/ui/badge";
import { IN_SCOPE_STATUSES, type InScopeStatus, STATUS_LABEL } from "@/lib/status";
import type { TeamMember, Ticket } from "@/lib/types";
import { TicketCard } from "./ticket-card";

interface Props {
  tickets: Ticket[];
  team: TeamMember[];
}

export function TicketColumns({ tickets, team }: Props) {
  const byStatus: Record<InScopeStatus, Ticket[]> = {
    "to-do": [],
    blocked: [],
    "in-progress": [],
    "peer-review": [],
  };
  for (const t of tickets) {
    if ((IN_SCOPE_STATUSES as readonly string[]).includes(t.status)) {
      byStatus[t.status as InScopeStatus].push(t);
    }
  }

  const teamById = Object.fromEntries(team.map((m) => [m.id, m]));

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 snap-x md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-4">
      {IN_SCOPE_STATUSES.map((status) => (
        <section
          key={status}
          aria-label={STATUS_LABEL[status]}
          className="flex min-w-[260px] flex-col gap-3 snap-start md:min-w-0"
        >
          <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-3 py-2">
            <h3 className="text-sm font-medium">{STATUS_LABEL[status]}</h3>
            <Badge variant="outline">{byStatus[status].length}</Badge>
          </header>
          <div className="flex flex-col gap-3">
            {byStatus[status].map((t) => (
              <TicketCard key={t.key} ticket={t} assignee={teamById[t.assigneeId]} />
            ))}
            {byStatus[status].length === 0 ? (
              <p className="text-xs text-muted-foreground">No tickets</p>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
