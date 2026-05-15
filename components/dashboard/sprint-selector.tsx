"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Sprint } from "@/lib/types";

interface Props {
  sprints: Sprint[];
  value: string;
  onChange: (sprintId: string) => void;
}

export function SprintSelector({ sprints, value, onChange }: Props) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v);
      }}
    >
      <SelectTrigger className="w-[220px]" aria-label="Select sprint">
        <SelectValue placeholder="Select sprint">
          {(v: string | null) => sprints.find((s) => s.id === v)?.name ?? "Select sprint"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {sprints.map((sprint) => (
          <SelectItem key={sprint.id} value={sprint.id}>
            {sprint.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
