import type { Sprint } from "@/lib/types";

export const currentSprintId = "sprint-42";

export const sprints: Sprint[] = [
  {
    id: "sprint-41",
    name: "Sprint 41",
    startDate: "2026-04-21",
    endDate: "2026-05-04",
    ticketKeys: ["CV-1200", "CV-1201", "CV-1202", "CV-1203", "CV-1204"],
  },
  {
    id: "sprint-42",
    name: "Sprint 42 (current)",
    startDate: "2026-05-05",
    endDate: "2026-05-18",
    ticketKeys: [
      "CV-1300",
      "CV-1301",
      "CV-1302",
      "CV-1303",
      "CV-1304",
      "CV-1305",
      "CV-1306",
      "CV-1307",
      "CV-1308",
      "CV-1309",
      "CV-1310",
      "CV-1311",
      "CV-1312",
      "CV-1313",
      "CV-1314",
      "CV-1315",
    ],
  },
  {
    id: "sprint-43",
    name: "Sprint 43",
    startDate: "2026-05-19",
    endDate: "2026-06-01",
    ticketKeys: ["CV-1400", "CV-1401", "CV-1402", "CV-1403", "CV-1404"],
  },
];

export const sprintById: Record<string, Sprint> = Object.fromEntries(sprints.map((s) => [s.id, s]));
