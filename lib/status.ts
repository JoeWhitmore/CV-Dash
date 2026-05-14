import type { Status } from "@/lib/types";

export const IN_SCOPE_STATUSES = [
  "to-do",
  "in-progress",
  "in-review",
  "peer-review",
] as const satisfies readonly Status[];

export type InScopeStatus = (typeof IN_SCOPE_STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  "to-do": "To Do",
  "in-progress": "In Progress",
  "in-review": "In Review",
  "peer-review": "Peer Review",
  testing: "Testing",
  done: "Done",
  closed: "Closed",
};

// Tailwind classes for badge colour. Out-of-scope statuses included for completeness.
export const STATUS_BADGE_CLASS: Record<Status, string> = {
  "to-do": "bg-muted text-muted-foreground",
  "in-progress": "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  "in-review": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  "peer-review": "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  testing: "bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200",
  done: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  closed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};
