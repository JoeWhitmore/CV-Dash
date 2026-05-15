import type { Status } from "@/lib/types";

const MAP: Record<string, Status> = {
  // CV-specific live statuses
  "to do": "to-do",
  backlog: "to-do",
  planned: "to-do",
  "ready for dev": "to-do",
  "ready for development": "to-do",
  discovery: "to-do",
  design: "to-do",
  "needs design": "to-do",
  blocked: "to-do",
  "in progress": "in-progress",
  building: "in-progress",
  "awaiting feedback": "in-progress",
  "in review": "in-review",
  "peer review": "peer-review",
  "in qa": "testing",
  "testing/uat": "testing",
  done: "done",
  "ready for release": "done",
  "won't do": "closed",
  // Common Jira defaults — retained for defensiveness
  open: "to-do",
  "in development": "in-progress",
  "code review": "in-review",
  "ready for review": "peer-review",
  "in testing": "testing",
  qa: "testing",
  testing: "testing",
  resolved: "done",
  closed: "closed",
};

export interface MappedStatus {
  status: Status;
  warning?: string;
}

export function mapJiraStatus(name: string): MappedStatus {
  const key = name.trim().toLowerCase();
  const status = MAP[key];
  if (status) return { status };
  return {
    status: "to-do",
    warning: `Unknown Jira status: '${name}' — mapped to 'to-do'`,
  };
}
