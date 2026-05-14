import type { Ticket } from "@/lib/types";

export const tickets: Ticket[] = [
  // ---- Sprint 42 (current) — in-scope statuses ----
  // To Do
  {
    key: "CV-1300",
    title: "Add sprint selector to dashboard",
    type: "story",
    status: "to-do",
    points: 3,
    assigneeId: "joe-w",
  },
  {
    key: "CV-1301",
    title: "Wire assignee filter to URL state",
    type: "task",
    status: "to-do",
    points: 2,
    assigneeId: "alex-k",
  },
  {
    key: "CV-1302",
    title: "Build burndown chart legend",
    type: "story",
    status: "to-do",
    points: 3,
    assigneeId: "priya-s",
  },
  {
    key: "CV-1303",
    title: "Fix dark-mode contrast on KPI tile",
    type: "bug",
    status: "to-do",
    points: 1,
    assigneeId: "sam-l",
  },

  // In Progress
  {
    key: "CV-1304",
    title: "Compose dashboard header with theme toggle",
    type: "story",
    status: "in-progress",
    points: 5,
    assigneeId: "rachel-b",
  },
  {
    key: "CV-1305",
    title: "Status badge colour map polish",
    type: "task",
    status: "in-progress",
    points: 2,
    assigneeId: "noor-h",
  },
  {
    key: "CV-1306",
    title: "Ticket card hover lift jitter",
    type: "bug",
    status: "in-progress",
    points: 1,
    assigneeId: "dan-r",
  },
  {
    key: "CV-1307",
    title: "Define burndown ideal-line algorithm",
    type: "story",
    status: "in-progress",
    points: 3,
    assigneeId: "mia-t",
  },

  // In Review
  {
    key: "CV-1308",
    title: "Refactor mock data exports",
    type: "task",
    status: "in-review",
    points: 2,
    assigneeId: "joe-w",
  },
  {
    key: "CV-1309",
    title: "Avatar fallback for missing image",
    type: "bug",
    status: "in-review",
    points: 1,
    assigneeId: "alex-k",
  },
  {
    key: "CV-1310",
    title: "Working-day helper edge cases",
    type: "story",
    status: "in-review",
    points: 3,
    assigneeId: "priya-s",
  },

  // Peer Review (== "complete" for scope rule)
  {
    key: "CV-1311",
    title: "Type definitions for dashboard data",
    type: "story",
    status: "peer-review",
    points: 3,
    assigneeId: "sam-l",
  },
  {
    key: "CV-1312",
    title: "shadcn ToggleGroup wrapping on narrow viewports",
    type: "bug",
    status: "peer-review",
    points: 2,
    assigneeId: "rachel-b",
  },
  {
    key: "CV-1313",
    title: "Status colour tokens in Tailwind theme",
    type: "task",
    status: "peer-review",
    points: 2,
    assigneeId: "noor-h",
  },

  // Out of scope — proves scope filter
  {
    key: "CV-1314",
    title: "Smoke test for /dashboard",
    type: "task",
    status: "testing",
    points: 2,
    assigneeId: "dan-r",
  },
  {
    key: "CV-1315",
    title: "Initial Next.js project setup",
    type: "task",
    status: "done",
    points: 1,
    assigneeId: "mia-t",
  },

  // ---- Sprint 41 (past) ----
  {
    key: "CV-1200",
    title: "Sprint 41 prep task",
    type: "task",
    status: "done",
    points: 2,
    assigneeId: "joe-w",
  },
  {
    key: "CV-1201",
    title: "Sprint 41 in-progress",
    type: "story",
    status: "in-progress",
    points: 3,
    assigneeId: "alex-k",
  },
  {
    key: "CV-1202",
    title: "Sprint 41 to do",
    type: "task",
    status: "to-do",
    points: 1,
    assigneeId: "priya-s",
  },
  {
    key: "CV-1203",
    title: "Sprint 41 peer review",
    type: "story",
    status: "peer-review",
    points: 5,
    assigneeId: "sam-l",
  },
  {
    key: "CV-1204",
    title: "Sprint 41 bug",
    type: "bug",
    status: "in-review",
    points: 2,
    assigneeId: "noor-h",
  },

  // ---- Sprint 43 (upcoming) ----
  {
    key: "CV-1400",
    title: "Sprint 43 planned story A",
    type: "story",
    status: "to-do",
    points: 5,
    assigneeId: "rachel-b",
  },
  {
    key: "CV-1401",
    title: "Sprint 43 planned story B",
    type: "story",
    status: "to-do",
    points: 3,
    assigneeId: "dan-r",
  },
  {
    key: "CV-1402",
    title: "Sprint 43 planned task A",
    type: "task",
    status: "to-do",
    points: 2,
    assigneeId: "mia-t",
  },
  {
    key: "CV-1403",
    title: "Sprint 43 planned task B",
    type: "task",
    status: "to-do",
    points: 2,
    assigneeId: "joe-w",
  },
  {
    key: "CV-1404",
    title: "Sprint 43 planned bug fix",
    type: "bug",
    status: "to-do",
    points: 1,
    assigneeId: "alex-k",
  },
];

export const ticketByKey: Record<string, Ticket> = Object.fromEntries(
  tickets.map((t) => [t.key, t]),
);
