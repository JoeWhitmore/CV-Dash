import { BookOpen, Bug, CircleCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/status";
import type { TeamMember, Ticket } from "@/lib/types";

const JIRA_BASE = "https://carevicinity.atlassian.net/browse";

const TYPE_ICON = {
  story: BookOpen,
  bug: Bug,
  task: CircleCheck,
} as const;

interface Props {
  ticket: Ticket;
  assignee: TeamMember | undefined;
}

export function TicketCard({ ticket, assignee }: Props) {
  const TypeIcon = TYPE_ICON[ticket.type];
  return (
    <a
      href={`${JIRA_BASE}/${ticket.key}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`${ticket.key}: ${ticket.title}`}
      className="block rounded-xl transition-shadow hover:shadow-md"
    >
      <Card>
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs">
              <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-mono text-muted-foreground">{ticket.key}</span>
            </span>
            <Badge className={STATUS_BADGE_CLASS[ticket.status]} variant="secondary">
              {STATUS_LABEL[ticket.status]}
            </Badge>
          </div>
          <p className="line-clamp-2 text-sm font-medium leading-snug">{ticket.title}</p>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[10px]">
                  {assignee?.initials ?? "??"}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{assignee?.name ?? "Unassigned"}</span>
            </span>
            <Badge variant="outline" className="font-mono">
              {ticket.points}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </a>
  );
}
