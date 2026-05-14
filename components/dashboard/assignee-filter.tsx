"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TeamMember } from "@/lib/types";

interface Props {
  team: TeamMember[];
  value: string[]; // assignee ids
  onChange: (ids: string[]) => void;
}

export function AssigneeFilter({ team, value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Assignees</span>
      <ToggleGroup multiple value={value} onValueChange={onChange} className="flex flex-wrap gap-1">
        {team.map((member) => (
          <ToggleGroupItem
            key={member.id}
            value={member.id}
            aria-label={member.name}
            className="h-8 gap-2 px-2 data-[state=on]:bg-secondary"
          >
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[10px]">{member.initials}</AvatarFallback>
            </Avatar>
            <span className="text-xs">{member.name.split(" ")[0]}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
